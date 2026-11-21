import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  type ProviderExecutionRequest,
  type ProviderExecutionRun,
  type ProviderExecutionSession,
  type ProviderSessionConfig,
  RequestedRunChannel,
  type RequestedRunTerminalEvent,
  SessionSnapshotState,
  type WithoutEventScope,
} from '@/core/execution';
import type {
  ProviderExecutionErrorEvent,
  ProviderSessionEvent,
} from '@/core/execution/ProviderExecutionEvent';
import type { ManagedStdioProcessExitState } from '@/core/process/ManagedStdioProcess';
import { ManagedStdioProcess } from '@/core/process/ManagedStdioProcess';
import type { ProviderRuntimeHost } from '@/core/providers/ProviderRuntimeHost';

import { parseZcodeModelSelectionId } from '../models';
import { resolveZcodePermissionMode } from '../permissionModes';
import { buildZcodeLaunchSpec } from '../runtime/ZcodeLaunchSpec';
import { buildZcodeRuntimeEnv } from '../runtime/ZcodeRuntimeEnvironment';
import { ZCODE_PROVIDER_ID } from '../settings';
import { createZcodeStreamParser, type ZcodeTurnOutput } from './ZcodeStreamParser';

interface ActiveExecution {
  readonly run: RequestedRunChannel;
  readonly parser: ReturnType<typeof createZcodeStreamParser>;
  process: ManagedStdioProcess | null;
  turnOutput: ZcodeTurnOutput | null;
  derivedConfigPath: string | null;
}

/**
 * One Claudian conversation maps to one native ZCode session. Each requested
 * turn spawns a fresh `zcode --prompt ... --output-format stream-json`
 * process; conversation continuity rides on the CLI's `--resume` flag.
 */
export class ZcodeExecutionSession implements ProviderExecutionSession {
  readonly providerId = ZCODE_PROVIDER_ID;
  readonly sessionInstanceId = randomUUID();

  readonly #state: SessionSnapshotState;
  readonly #host: ProviderRuntimeHost;
  readonly #config: ProviderSessionConfig;
  #active: ActiveExecution | null = null;
  #disposed = false;
  #nativeSessionId: string | null;

  constructor(host: ProviderRuntimeHost, config: ProviderSessionConfig) {
    this.#host = host;
    this.#config = config;
    this.#nativeSessionId = config.resumeSeed?.providerSessionId ?? null;
    this.#state = new SessionSnapshotState({
      providerId: ZCODE_PROVIDER_ID,
      sessionInstanceId: this.sessionInstanceId,
      readProviderSessionId: () => this.#nativeSessionId,
    });
  }

  execute(request: ProviderExecutionRequest): ProviderExecutionRun {
    if (this.#disposed) throw new Error('ZCode execution session is disposed.');
    if (this.#active) throw new Error('ZCode execution session is already executing.');
    const run = new RequestedRunChannel({
      sessionInstanceId: this.sessionInstanceId,
      onCancel: source => {
        void this.#handleCancellation(run, source === 'abort-signal' ? 'request aborted' : 'cancelled');
      },
    });
    this.#active = {
      run,
      parser: createZcodeStreamParser(),
      process: null,
      turnOutput: null,
      derivedConfigPath: null,
    };
    this.#state.setStatus('executing');
    this.#emitCurrentSnapshot();
    run.attachAbortSignal(request.signal);
    if (!run.isCancellationRequested) void this.#performExecution(request);
    return run;
  }

  cancel(): void {
    this.#active?.run.cancel();
  }

  getSnapshot() {
    return this.#state.getSnapshot();
  }

  getStatus() {
    return this.#state.status;
  }

  onEvent(listener: (event: ProviderSessionEvent) => void): () => void {
    return this.#state.onEvent(listener);
  }

  dispose(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#disposed = true;
    const active = this.#active;
    if (active) {
      active.run.cancel();
      return this.#shutdownProcess(active).then(() => {
        this.#state.clearListeners();
        this.#state.setStatus('disposed');
      });
    }
    this.#state.clearListeners();
    this.#state.setStatus('disposed');
    return Promise.resolve();
  }

  async #performExecution(request: ProviderExecutionRequest): Promise<void> {
    const active = this.#active;
    if (!active) return;
    try {
      const cliPath = await this.#host.resolveCliPath();
      if (!cliPath) {
        this.#endWithConfigurationError(active, 'ZCode CLI not found. Set the path in the ZCode provider settings.');
        return;
      }
      if (active.run.isCancellationRequested) return;
      const workingDirectory = this.#config.workingDirectory || this.#host.workingDirectory || '';
      if (!workingDirectory) {
        this.#endWithConfigurationError(active, 'ZCode requires a local working directory.');
        return;
      }
      const env = buildZcodeRuntimeEnv(this.#host.environmentText, cliPath);
      const modelSelection = parseZcodeModelSelectionId(request.configuration.model);
      const spec = buildZcodeLaunchSpec({
        cliPath,
        workingDirectory,
        prompt: extractPromptText(request),
        mode: resolveZcodePermissionMode(request.configuration.permissionMode),
        resumeSessionId: this.#nativeSessionId,
        modelSelection,
      });
      const derivedConfigPath = modelSelection
        ? spec.env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE
        : undefined;
      active.derivedConfigPath = derivedConfigPath ?? null;
      if (active.run.isCancellationRequested) return;
      const child = new ManagedStdioProcess({
        command: spec.command,
        args: spec.args,
        cwd: workingDirectory,
        env: { ...env, ...spec.env },
      });
      active.process = child;
      const closePromise = new Promise<ManagedStdioProcessExitState>((resolve) => {
        child.onClose(() => resolve(child.getExitState() ?? { closed: true, code: null, signal: null }));
      });
      child.start();
      const readline = createInterface({ input: child.stdout });
      readline.on('line', (line: string) => {
        this.#handleStreamLine(active, line);
      });
      const exitState = await closePromise;
      readline.close();
      if (active.run.isCancellationRequested) return;
      if (active.turnOutput) {
        this.#finishCompletedTurn(active);
        return;
      }
      this.#endWithProcessFailure(active, exitState);
    } catch (error) {
      this.#endWithExecutionError(active, {
        category: 'unknown',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
    }
  }

  #handleStreamLine(active: ActiveExecution, line: string): void {
    if (active.run.isTerminal || !line.trim()) return;
    const parsed = active.parser.parseLine(line);
    for (const event of parsed.events) {
      active.run.emit(event);
    }
    if (parsed.sessionId && parsed.sessionId !== this.#nativeSessionId) {
      this.#nativeSessionId = parsed.sessionId;
      this.#state.bumpRevision();
      this.#emitCurrentSnapshot();
    }
    if (parsed.turnOutput) {
      active.turnOutput = parsed.turnOutput;
    }
  }

  #finishCompletedTurn(active: ActiveExecution): void {
    const output = active.turnOutput;
    if (output?.usage) {
      active.run.emit({ type: 'usage_updated', usage: output.usage });
    }
    this.#state.setStatus('idle');
    this.#emitCurrentSnapshot();
    this.#endRun(active, {
      ...(output?.turnStats ? { turnStats: { ...output.turnStats } } : {}),
      reason: 'completed',
      type: 'turn_completed',
    });
    void this.#shutdownProcess(active);
  }

  #handleCancellation(run: RequestedRunChannel, reason: string): void {
    const active = this.#active;
    if (!active || active.run !== run || run.isTerminal) return;
    this.#state.setStatus('cancelling');
    this.#emitCurrentSnapshot();
    void this.#shutdownProcess(active).then(() => {
      this.#state.setStatus('idle');
      this.#emitCurrentSnapshot();
      this.#endRun(active, { reason, type: 'cancelled' });
    });
  }

  async #shutdownProcess(active: ActiveExecution): Promise<void> {
    const child = active.process;
    active.process = null;
    if (!child) return;
    await child.shutdown().catch(() => undefined);
  }

  #endRun(active: ActiveExecution, terminal: RequestedRunTerminalEvent): void {
    this.#active = null;
    active.run.finish(terminal);
    const derivedConfigPath = active.derivedConfigPath;
    if (derivedConfigPath) {
      active.derivedConfigPath = null;
      try {
        rmSync(derivedConfigPath, { force: true });
      } catch {
        // A stuck temp file outlives the turn; the OS temp dir clears it eventually.
      }
    }
  }

  #endWithConfigurationError(active: ActiveExecution, message: string): void {
    this.#endWithExecutionError(active, {
      category: 'configuration',
      message,
      recoverable: false,
    });
  }

  #endWithExecutionError(active: ActiveExecution, error: Omit<WithoutEventScope<ProviderExecutionErrorEvent>, "type">): void {
    this.#state.setStatus('idle');
    this.#emitCurrentSnapshot();
    this.#endRun(active, { ...error, type: "execution_error" });
    void this.#shutdownProcess(active);
  }

  #endWithProcessFailure(active: ActiveExecution, exitState: ManagedStdioProcessExitState | null): void {
    const stderr = active.process?.getStderrSnapshot() ?? '';
    const detail = stderr || (exitState?.code != null
      ? `ZCode CLI exited with code ${exitState.code}.`
      : 'ZCode CLI closed the stream before completing the turn.');
    this.#endWithExecutionError(active, {
      category: exitState?.error ? 'configuration' : 'provider',
      message: detail,
      recoverable: true,
    });
  }

  #emitCurrentSnapshot(): void {
    const active = this.#active;
    const event = {
      snapshot: this.#state.getSnapshot(),
      type: 'session_state_changed' as const,
    };
    if (active && !active.run.isTerminal) {
      active.run.emit(event);
      return;
    }
    this.#state.emit(event);
  }
}

function extractPromptText(request: ProviderExecutionRequest): string {
  return request.input
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}
