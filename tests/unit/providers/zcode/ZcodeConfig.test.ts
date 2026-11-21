import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ZCODE_PROVIDER_SETTINGS,
  decodeZcodeConfig,
  updateZcodeConfig,
} from '@/providers/zcode/config';
import { resolveZcodePermissionMode, ZCODE_PERMISSION_MODE_POLICY } from '@/providers/zcode/permissionModes';

describe('zcode provider config', () => {
  it('decodes stored values with defaults for missing fields', () => {
    const settings = decodeZcodeConfig({ enabled: true, cliPath: 'C:/bin/zcode.exe' }, { referencedModelIds: [] });
    expect(settings.enabled).toBe(true);
    expect(settings.cliPath).toBe('C:/bin/zcode.exe');
    expect(settings.cliPathsByHost).toEqual({});
    expect(settings.environmentVariables).toBe('');
  });

  it('writes a host-keyed cli path and clears the legacy field', () => {
    const config: Record<string, unknown> = {};
    updateZcodeConfig(config, { referencedModelIds: [] }, { cliPath: 'H:/Tool/zcode.cjs' });
    const decoded = decodeZcodeConfig(config, { referencedModelIds: 'x' as never } as never);
    expect(Object.keys(decoded.cliPathsByHost).length).toBe(1);
    expect(decoded.cliPath).toBe('');
  });

  it('keeps the plan mode as the fail-closed fallback for unknown values', () => {
    expect(resolveZcodePermissionMode('yolo')).toBe('yolo');
    expect(resolveZcodePermissionMode('anything-unknown')).toBe('plan');
    expect(ZCODE_PERMISSION_MODE_POLICY.fallbackValue).toBe('plan');
  });
});
