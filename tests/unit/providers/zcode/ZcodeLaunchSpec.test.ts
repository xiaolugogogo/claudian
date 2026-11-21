import { mkdirSync, mkdtempSync, rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildZcodeLaunchSpec } from '@/providers/zcode/runtime/ZcodeLaunchSpec';

const tempRoots: string[] = [];

function makeFakeInstall(layout: {
  bundleDir: boolean;
  npmLayout: boolean;
  desktopLayout: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'zcode-launch-'));
  tempRoots.push(root);
  if (layout.bundleDir) {
    writeFileSync(join(root, 'zcode.cjs'), '// bundle');
  }
  if (layout.npmLayout) {
    mkdirSync(join(root, 'provider'), { recursive: true });
    writeFileSync(join(root, 'provider', 'zcode-builtin.json'), '{}');
  }
  if (layout.desktopLayout) {
    mkdirSync(join(root, 'config', 'provider'), { recursive: true });
    writeFileSync(join(root, 'config', 'provider', 'zcode-builtin.json'), '{}');
  }
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('buildZcodeLaunchSpec', () => {
  const base = {
    workingDirectory: 'F:/vault',
    prompt: 'hi',
    mode: 'yolo',
    resumeSessionId: null,
    modelSelection: null,
  };

  it('launches a standalone binary directly without extra env', () => {
    const spec = buildZcodeLaunchSpec({ ...base, cliPath: 'C:/bin/zcode.exe' });
    expect(spec.command).toBe('C:/bin/zcode.exe');
    expect(spec.args.slice(0, 2)).toEqual(['--prompt', 'hi']);
    expect(spec.env).toEqual({});
    expect(spec.env).toEqual({});
  });

  it('launches a .cjs bundle through Node with ELECTRON_RUN_AS_NODE', () => {
    const spec = buildZcodeLaunchSpec({ ...base, cliPath: 'C:/bin/zcode.cjs' });
    expect(spec.command).toMatch(/node(\.exe)?$/i);
    expect(spec.args[0]).toBe('C:/bin/zcode.cjs');
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('injects the desktop builtin provider config for bundle launches', () => {
    const root = makeFakeInstall({ bundleDir: false, npmLayout: false, desktopLayout: true });
    mkdirSync(join(root, 'glm'), { recursive: true });
    writeFileSync(join(root, 'glm', 'zcode.cjs'), '// bundle');
    const spec = buildZcodeLaunchSpec({ ...base, cliPath: join(root, 'glm', 'zcode.cjs') });
    expect(spec.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE).toBe(
      join(root, 'config', 'provider', 'zcode-builtin.json'),
    );
  });

  it('injects the npm-layout builtin config next to the bundle', () => {
    const root = makeFakeInstall({ bundleDir: true, npmLayout: true, desktopLayout: false });
    const spec = buildZcodeLaunchSpec({ ...base, cliPath: join(root, 'zcode.cjs') });
    expect(spec.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE).toBe(
      join(root, 'provider', 'zcode-builtin.json'),
    );
  });

  it('leaves the env var unset when no builtin config exists', () => {
    const root = makeFakeInstall({ bundleDir: true, npmLayout: false, desktopLayout: false });
    const spec = buildZcodeLaunchSpec({ ...base, cliPath: join(root, 'zcode.cjs') });
    expect(spec.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE).toBeUndefined();
  });

  it('passes --resume for session continuity', () => {
    const spec = buildZcodeLaunchSpec({ ...base, cliPath: 'C:/bin/zcode.exe', resumeSessionId: 'sess_x' });
    expect(spec.args).toContain('--resume');
    expect(spec.args).toContain('sess_x');
  });
});
