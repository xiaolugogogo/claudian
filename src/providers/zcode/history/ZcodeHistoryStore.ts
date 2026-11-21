import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ChatMessage } from '@/core/types/chat';
import type { ToolCallInfo } from '@/core/types/tools';

/** Minimal shape of `node:sqlite`'s DatabaseSync used here. */
interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
}

/** `node:sqlite` (Node >= 22.3); undefined on runtimes without it. */
function loadSqlite(): SqliteModule | null {
  const builtin = process.getBuiltinModule?.('node:sqlite') as SqliteModule | undefined;
  return builtin ?? null;
}

/**
 * Resolves ZCode's session database: `ZCODE_SESSION_DB_PATH` wins, then the
 * data-base-dir layout (`<base>/cli/db/db.sqlite`), then the home default.
 */
export function resolveZcodeSessionDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ZCODE_SESSION_DB_PATH?.trim();
  if (explicit) return explicit;
  const base = env.ZCODE_DATA_BASE_DIR?.trim() || homedir();
  return join(base, '.zcode', 'cli', 'db', 'db.sqlite');
}

export function zcodeSessionDbExists(env: NodeJS.ProcessEnv = process.env): boolean {
  return existsSync(resolveZcodeSessionDbPath(env));
}

function withSessionDb<T>(env: NodeJS.ProcessEnv, run: (db: SqliteDatabase) => T, fallback: T): T {
  const sqlite = loadSqlite();
  if (!sqlite) return fallback;
  let db: SqliteDatabase | null = null;
  try {
    db = new sqlite.DatabaseSync(resolveZcodeSessionDbPath(env), { readOnly: true });
    return run(db);
  } catch {
    // A locked, migrating, or absent store must never fail a conversation open.
    return fallback;
  } finally {
    db?.close();
  }
}

/** Reads one native session's conversational history; [] when the store is unreadable or the session is absent. */
export function readZcodeNativeHistory(nativeSessionId: string, env: NodeJS.ProcessEnv = process.env): ChatMessage[] {
  return withSessionDb(env, (db) => {
    const rows = db.prepare(`
      SELECT m.id AS messageId,
             json_extract(m.data, '$.role') AS role,
             json_extract(m.data, '$.synthetic') AS synthetic,
             json_extract(m.data, '$.time.created') AS timeCreated,
             p.data AS partData
      FROM message m LEFT JOIN part p ON p.message_id = m.id
      WHERE m.session_id = ?
      ORDER BY m.sequence, p.sequence
    `).all(nativeSessionId) as unknown as NativeRow[];
    return buildTurns(rows);
  }, []);
}

/** Cheap revision token: the native session's last update time; null when unknown. */
export function readZcodeHistoryRevision(nativeSessionId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return withSessionDb(env, (db) => {
    const row = db.prepare('SELECT time_updated FROM session WHERE id = ?').get(nativeSessionId) as { time_updated: number } | undefined;
    return row ? String(row.time_updated) : null;
  }, null);
}

/** Reports whether the native session still exists in ZCode's store. */
export function zcodeSessionExists(nativeSessionId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return withSessionDb(env, (db) => Boolean(db.prepare('SELECT 1 FROM session WHERE id = ?').get(nativeSessionId)), false);
}

interface NativeRow {
  messageId: string;
  role: string | null;
  synthetic: number | null;
  timeCreated: number | null;
  partData: string | null;
}

interface ZcodeNativeTurn {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly timestamp: number;
  text: string;
  reasoning: string;
  readonly tools: ToolCallInfo[];
}

interface ZcodeNativePart {
  type?: string;
  text?: string;
  synthetic?: boolean;
  callID?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: string;
  };
}

function buildTurns(rows: NativeRow[]): ChatMessage[] {
  const turns = new Map<string, ZcodeNativeTurn>();
  const order: string[] = [];
  for (const row of rows) {
    if (row.synthetic) continue;
    let turn = turns.get(row.messageId);
    if (!turn) {
      if (row.role !== 'user' && row.role !== 'assistant') continue;
      turn = {
        id: row.messageId,
        role: row.role,
        timestamp: typeof row.timeCreated === 'number' ? row.timeCreated : Date.now(),
        text: '',
        reasoning: '',
        tools: [],
      };
      turns.set(row.messageId, turn);
      order.push(row.messageId);
    }
    if (!row.partData) continue;
    let part: ZcodeNativePart;
    try {
      const parsed: unknown = JSON.parse(row.partData);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      part = parsed;
    } catch {
      continue;
    }
    if (!part.type || part.synthetic) continue;
    switch (part.type) {
      case 'text':
        turn.text += part.text ?? '';
        break;
      case 'reasoning':
        turn.reasoning += part.text ?? '';
        break;
      case 'tool': {
        if (!part.callID || !part.tool || !part.state) break;
        turn.tools.push({
          id: part.callID,
          name: part.tool,
          input: (part.state.input && typeof part.state.input === 'object' && !Array.isArray(part.state.input)
            ? part.state.input
            : {}) as Record<string, unknown>,
          status: part.state.status === 'error' ? 'error' : part.state.status === 'completed' ? 'completed' : 'running',
          ...(typeof part.state.output === 'string' ? { result: part.state.output } : {}),
        });
        break;
      }
      default:
        break;
    }
  }
  const messages: ChatMessage[] = [];
  for (const id of order) {
    const turn = turns.get(id);
    if (!turn) continue;
    if (turn.role === 'assistant' && !turn.text.trim() && turn.tools.length === 0) continue;
    messages.push({
      id: turn.id,
      role: turn.role,
      content: turn.text,
      timestamp: turn.timestamp,
      ...(turn.role === 'assistant' && turn.tools.length > 0 ? { toolCalls: turn.tools } : {}),
    });
  }
  return messages;
}
