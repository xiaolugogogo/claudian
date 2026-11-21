import { existsSync } from 'node:fs';
import { delimiter as pathDelimiter, dirname, join } from 'node:path';

/**
 * Builds the per-turn launch spec for the ZCode CLI. A turn is one process:
 * `zcode --prompt <text> --cwd <dir> --mode <mode> --output-format stream-json`.
 *
 * A configured `zcode.cjs` bundle runs through Node. The bundled desktop app
 * ships zcode.cjs without a node.exe, so Node resolution prefers PATH and
 * falls back to the host's Electron binary in `ELECTRON_RUN_AS_NODE` mode
 * (Obsidian itself is Electron, so this always exists).
 */
export interface ZcodeLaunchSpec {
  readonly command: string;
  readonly args: string[];
  readonly env: Record<string, string | undefined>;
}

export interface ZcodeLaunchSpecInputs {
  readonly cliPath: string;
  readonly workingDirectory: string;
  readonly prompt: string;
  readonly mode: string;
  readonly resumeSessionId: string | null;
}

export function buildZcodeLaunchSpec(inputs: ZcodeLaunchSpecInputs): ZcodeLaunchSpec {
  const cliArgs = buildZcodeCliArgs(inputs);
  const env: Record<string, string | undefined> = {};
  const builtinConfig = discoverZcodeBuiltinProviderConfig(inputs.cliPath);
  if (builtinConfig) {
    env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = builtinConfig;
  }
  if (!isNodeBundlePath(inputs.cliPath)) {
    return { command: inputs.cliPath, args: cliArgs, env };
  }
  return {
    command: resolveNodeExecutable(),
    args: [inputs.cliPath, ...cliArgs],
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  };
}

/**
 * Desktop installs ship the built-in provider catalog outside the CLI bundle's
 * own search paths (`resources/config/provider/zcode-builtin.json` next to the
 * bundle's parent), so a `zcode.cjs` spawned from the bundle directory cannot
 * locate it and fails before the turn. The env var is the CLI's own override;
 * it stays unset for layouts the CLI resolves by itself.
 */
function discoverZcodeBuiltinProviderConfig(cliPath: string): string | null {
  const dir = dirname(cliPath);
  const candidates = [
    join(dir, 'provider', 'zcode-builtin.json'),
    join(dir, '..', 'config', 'provider', 'zcode-builtin.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // A malformed path falls through to the next candidate.
    }
  }
  return null;
}

function buildZcodeCliArgs(inputs: ZcodeLaunchSpecInputs): string[] {
  const args = [
    '--prompt', inputs.prompt,
    '--cwd', inputs.workingDirectory,
    '--mode', inputs.mode,
    '--output-format', 'stream-json',
    // Headless has no approval client; interaction-only tools would fail the turn.
    '--disallowed-tools', 'AskUserQuestion EnterPlanMode ExitPlanMode',
    '--no-color',
  ];
  if (inputs.resumeSessionId) {
    args.push('--resume', inputs.resumeSessionId);
  }
  return args;
}

function isNodeBundlePath(path: string): boolean {
  return path.toLowerCase().endsWith('.cjs');
}

function resolveNodeExecutable(): string {
  const fromPath = findNodeOnPath();
  if (fromPath) return fromPath;
  // Obsidian is Electron: its own binary runs any script as plain Node.
  return process.execPath;
}

function findNodeOnPath(): string | null {
  const names = process.platform === 'win32' ? ['node.exe', 'node.cmd'] : ['node'];
  for (const directory of (process.env.PATH ?? '').split(pathDelimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
