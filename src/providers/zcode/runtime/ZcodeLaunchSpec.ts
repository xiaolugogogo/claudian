import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter as pathDelimiter, dirname, join } from 'node:path';

import {
  deriveZcodePersonalConfig,
  parseZcodeCatalog,
  readZcodePersonalConfig,
  resolveZcodePersonalConfigPath,
  resolveZcodeSelectionToProviderId,
  type ZcodeModelSelection,
} from './ZcodePersonalConfig';

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
  /** A concrete `zcode:` selection pins the model through a derived config. */
  readonly modelSelection: ZcodeModelSelection | null;
}

export function buildZcodeLaunchSpec(inputs: ZcodeLaunchSpecInputs): ZcodeLaunchSpec {
  const cliArgs = buildZcodeCliArgs(inputs);
  const env: Record<string, string | undefined> = {};
  const builtinConfig = discoverZcodeBuiltinProviderConfig(inputs.cliPath);
  if (builtinConfig) {
    env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = builtinConfig;
  }
  const derivedConfigPath = writeDerivedPersonalConfig(inputs.modelSelection);
  if (derivedConfigPath) {
    env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE = derivedConfigPath;
  }
  const spec: ZcodeLaunchSpec = {
    command: inputs.cliPath,
    args: cliArgs,
    env,
  };
  if (!isNodeBundlePath(inputs.cliPath)) {
    return spec;
  }
  return {
    ...spec,
    command: resolveNodeExecutable(),
    args: [inputs.cliPath, ...cliArgs],
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  };
}

/**
 * Writes the per-turn derived personal config for a concrete model selection
 * and returns its path for cleanup. ZCode reads its model from config files
 * rather than a `--model` flag; the derived file pins `defaultModelSelection`
 * and moves the selected provider to the front of `providerOrder` while
 * keeping every provider, model rule and credential from the user's real
 * configuration untouched.
 */
function writeDerivedPersonalConfig(selection: ZcodeModelSelection | null): string | null {
  if (!selection) return null;
  try {
    const sourcePath = resolveZcodePersonalConfigPath();
    const source = readZcodePersonalConfig(sourcePath);
    if (!source) return null;
    // Selection ids address providers by name; resolve the internal uuid here.
    const providerId = resolveZcodeSelectionToProviderId(selection, parseZcodeCatalog(source));
    if (!providerId) return null;
    const derived = deriveZcodePersonalConfig(source, { providerId, modelId: selection.modelId });
    const path = join(tmpdir(), `claudian-zcode-config-${randomUUID()}.json`);
    writeFileSync(path, JSON.stringify(derived, null, 2), { encoding: 'utf8', mode: 0o600 });
    return path;
  } catch {
    // Falling back to the user's own default selection beats failing the turn.
    return null;
  }
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
