// @test-ci {"inputs":["tests/fixtures/providers/zcode/stream-text.jsonl","tests/fixtures/providers/zcode/stream-tools.jsonl"]}
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createZcodeStreamParser } from '@/providers/zcode/execution/ZcodeStreamParser';

function readFixture(name: string): string[] {
  return readFileSync('tests/fixtures/providers/zcode/' + name, 'utf8')
    .split('\n')
    .filter(line => line.trim());
}

describe('ZcodeStreamParser', () => {
  it('maps a real text-only turn: session id, text deltas and completion output', () => {
    const parser = createZcodeStreamParser();
    const textDeltas: string[] = [];
    let sessionId: string | null = null;
    let turnOutput: ReturnType<typeof parser.parseLine>['turnOutput'] = null;
    for (const line of readFixture('stream-text.jsonl')) {
      const parsed = parser.parseLine(line);
      for (const event of parsed.events) {
        if (event.type === 'text_delta') textDeltas.push(event.text);
      }
      sessionId = parsed.sessionId ?? sessionId;
      if (parsed.turnOutput) turnOutput = parsed.turnOutput;
    }
    expect(textDeltas.join('')).toBe('OK');
    expect(sessionId).toMatch(/^sess_/);
    expect(turnOutput?.response).toBe('OK');
    expect(turnOutput?.usage?.contextWindow).toBe(1000000);
    expect(turnOutput?.turnStats?.outputTokens).toBe(28546);
    expect(turnOutput?.turnStats?.durationMs).toBe(15333);
  });

  it('maps a real tool turn: scheduled becomes tool_started, result becomes tool_completed', () => {
    const parser = createZcodeStreamParser();
    const started: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    for (const line of readFixture('stream-tools.jsonl')) {
      const parsed = parser.parseLine(line);
      for (const event of parsed.events) {
        if (event.type === 'tool_started') started.push(event as unknown as Record<string, unknown>);
        if (event.type === 'tool_completed') completed.push(event as unknown as Record<string, unknown>);
      }
    }
    expect(started.length).toBe(2);
    expect(started[0]).toMatchObject({ name: 'Write', toolCallId: expect.any(String) });
    expect(completed.length).toBe(2);
    expect(completed[0]).toMatchObject({ isError: false });
    expect(String(completed[0].content)).toContain('hello.txt');
  });

  it('ignores unknown event types and malformed lines', () => {
    const parser = createZcodeStreamParser();
    expect(parser.parseLine('not json at all').events).toEqual([]);
    expect(parser.parseLine('').events).toEqual([]);
    const unknown = parser.parseLine('{"type":"future.event","sessionId":"sess_x","payload":{"a":1}}');
    expect(unknown.events).toEqual([]);
    expect(unknown.sessionId).toBe('sess_x');
  });

  it('maps the closing result line with projection context', () => {
    const parser = createZcodeStreamParser();
    let resultParsed: ReturnType<typeof parser.parseLine> | null = null;
    for (const line of readFixture('stream-text.jsonl')) {
      const parsed = parser.parseLine(line);
      if (parsed.isResult) resultParsed = parsed;
    }
    expect(resultParsed).not.toBeNull();
    expect(resultParsed?.isResult).toBe('result');
    expect(resultParsed?.turnOutput?.response).toBe('OK');
    expect(resultParsed?.turnOutput?.usage?.contextWindow).toBe(1000000);
  });
});
