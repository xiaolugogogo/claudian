import type {
  ProviderExecutionEvent,
  WithoutEventScope,
} from '../../../core/execution/ProviderExecutionEvent';
import type { UsageInfo } from '../../../core/types/chat';

/**
 * Maps `zcode --output-format stream-json` lines to Claudian execution events.
 *
 * Grounded in real ZCode 3.19.1 captures (2026-11-21). Stream-json is a
 * CLI-private format and may evolve; unknown event types and payload shapes
 * are ignored rather than failing the turn.
 */
export interface ZcodeStreamEnvelope {
  readonly type: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly payload?: unknown;
  /** The closing flat `type: "result"` line carries its fields at top level. */
  readonly response?: string;
  readonly usage?: unknown;
  readonly projection?: unknown;
}

export interface ZcodeTurnOutput {
  readonly response: string;
  readonly usage: UsageInfo | null;
  readonly turnStats: { outputTokens: number; durationMs: number } | null;
}

export interface ZcodeParsedLine {
  readonly events: readonly WithoutEventScope<ProviderExecutionEvent>[];
  /** Native session id from the event envelope; null when absent. */
  readonly sessionId: string | null;
  /** True when the line was the CLI's closing flat result line. */
  readonly isResult: false | 'result';
  /** Non-null on `turn.completed` and the closing result line. */
  readonly turnOutput: ZcodeTurnOutput | null;
}

/** One parser instance serves one turn; it tracks context-window info. */
export function createZcodeStreamParser() {
  let contextWindow = 0;
  let contextUsed = 0;
  let lastTurnStats: { outputTokens: number; durationMs: number } | null = null;

  const parseLine = (raw: string): ZcodeParsedLine => {
    const envelope = safeParse(raw);
    if (!envelope) return EMPTY;
    const sessionId = readString(envelope.sessionId);
    if (envelope.type === 'result') {
      const payload = asRecord(envelope.payload);
      const response = readString(envelope.response) ?? readString(payload?.response) ?? '';
      const projection = asRecord(envelope.projection);
      const output = buildTurnOutput(envelope.usage, response, payload, {
        contextWindow: contextWindow || readNumber(projection?.contextWindow) || 0,
        contextUsed: contextUsed || readNumber(projection?.contextUsed) || 0,
      });
      return {
        events: [],
        sessionId,
        isResult: 'result',
        turnOutput: {
          response: output.response,
          usage: output.usage,
          turnStats: {
            outputTokens: output.turnStats?.outputTokens || lastTurnStats?.outputTokens || 0,
            durationMs: output.turnStats?.durationMs || lastTurnStats?.durationMs || 0,
          },
        },
      };
    }
    const payload = asRecord(envelope.payload);
    observeContext(payload);
    const events = mapEventEnvelope(envelope, payload);
    if (envelope.type === 'turn.completed') {
      const response = readString(payload?.response) ?? '';
      const output = buildTurnOutput(payload?.usage, response, payload, { contextWindow, contextUsed });
      lastTurnStats = output.turnStats;
      return {
        events,
        sessionId,
        isResult: false,
        turnOutput: output,
      };
    }
    return { events, sessionId, isResult: false, turnOutput: null };
  };
  return { parseLine };

  function observeContext(payload: Record<string, unknown> | null): void {
    const window = readNumber(payload?.contextWindow);
    if (window) contextWindow = window;
    const used = readNumber(payload?.contextUsed);
    if (used) contextUsed = used;
  }
}

const EMPTY: ZcodeParsedLine = { events: [], sessionId: null, isResult: false, turnOutput: null };

function mapEventEnvelope(
  envelope: ZcodeStreamEnvelope,
  payload: Record<string, unknown> | null,
): WithoutEventScope<ProviderExecutionEvent>[] {
  const events: WithoutEventScope<ProviderExecutionEvent>[] = [];
  switch (envelope.type) {
    case 'turn.started':
      events.push({
        type: 'turn_started',
        accepted: true,
        ...(envelope.turnId ? { nativeTurnId: envelope.turnId } : {}),
      });
      break;
    case 'model.streaming': {
      const kind = readString(payload?.kind);
      const delta = readString(payload?.delta);
      const assistantMessageId = readString(payload?.assistantMessageId);
      if (kind === 'text_delta' && delta) {
        events.push({ type: 'text_delta', text: delta });
      } else if ((kind === 'start' || kind === 'text_start') && assistantMessageId) {
        events.push({ type: 'assistant_message_started', nativeAssistantId: assistantMessageId });
      }
      break;
    }
    case 'tool.updated': {
      const kind = readString(payload?.kind);
      const toolCallId = readString(payload?.toolCallId);
      if (!toolCallId) break;
      if (kind === 'scheduled') {
        events.push({
          type: 'tool_started',
          toolCallId,
          name: readString(payload?.toolName) ?? 'unknown',
          input: asRecord(payload?.input) ?? {},
          toolScope: { kind: 'main' },
        });
      } else if (kind === 'result') {
        const result = asRecord(payload?.result);
        events.push({
          type: 'tool_completed',
          toolCallId,
          ...(readString(result?.content) ? { content: readString(result?.content)! } : {}),
          isError: result ? result.success === false : undefined,
          toolScope: { kind: 'main' },
        });
      }
      // 'started' re-confirms scheduling; 'batch' aggregates completed ids.
      break;
    }
    default:
      break;
  }
  return events;
}

function buildTurnOutput(
  usageValue: unknown,
  response: string,
  payload: Record<string, unknown> | null,
  context: { contextWindow: number; contextUsed: number },
): ZcodeTurnOutput {
  const usage = parseZcodeUsage(usageValue, context);
  return {
    response,
    usage,
    turnStats: {
      outputTokens: readNumber(payload?.tokenCount) ?? usage?.contextTokens ?? 0,
      durationMs: readNumber(payload?.duration) ?? 0,
    },
  };
}

/** Maps the ZCode usage record to Claudian's UsageInfo; null when there is no usage. */
export function parseZcodeUsage(
  value: unknown,
  context: { contextWindow: number; contextUsed: number },
): UsageInfo | null {
  const record = asRecord(value);
  if (!record) return null;
  const inputTokens = readNumber(record.inputTokens) ?? 0;
  const outputTokens = readNumber(record.outputTokens) ?? 0;
  const totalTokens = readNumber(record.totalTokens) ?? inputTokens + outputTokens;
  const cacheWrite = readNumber(record.cacheWriteTokens);
  const cacheRead = readNumber(record.cacheReadTokens);
  const windowSize = context.contextWindow;
  if (!windowSize && inputTokens === 0 && outputTokens === 0) return null;
  const contextTokens = context.contextUsed || totalTokens;
  return {
    inputTokens,
    ...(cacheWrite ? { cacheCreationInputTokens: cacheWrite } : {}),
    ...(cacheRead ? { cacheReadInputTokens: cacheRead } : {}),
    contextWindow: windowSize,
    contextTokens,
    percentage: windowSize ? Math.round((contextTokens / windowSize) * 1000) / 10 : 0,
  };
}

function safeParse(raw: string): ZcodeStreamEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ZcodeStreamEnvelope;
    return null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
