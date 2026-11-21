import { describe, expect, it } from 'vitest';

import {
  deriveZcodePersonalConfig,
  parseZcodeCatalog,
  resolveZcodePersonalConfigPath,
} from '@/providers/zcode/runtime/ZcodePersonalConfig';

function makeConfig(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    config: {
      providerOrder: ['p-step', 'p-dp'],
      providerConfigRules: {
        providerRules: [
          { providerId: 'p-step', providerName: 'stepfun' },
          { providerId: 'p-dp', providerName: 'dp' },
        ],
      },
      modelConfigRules: {
        providerModelRules: [
          { providerId: 'p-step', modelId: 'step-5-preview' },
          { providerId: 'p-dp', modelId: 'deepseek-flash' },
          { providerId: 'p-dp', modelId: 'deepseek-r1' },
        ],
      },
    },
  };
}

describe('ZcodePersonalConfig', () => {
  it('parses catalog entries with provider labels', () => {
    const entries = parseZcodeCatalog(makeConfig());
    expect(entries.map(entry => entry.id)).toEqual([
      'zcode:p-step/step-5-preview',
      'zcode:p-dp/deepseek-flash',
      'zcode:p-dp/deepseek-r1',
    ]);
    expect(entries[1]).toMatchObject({ providerLabel: 'dp', modelId: 'deepseek-flash' });
  });

  it('derives a config that pins the selection and reorders providers', () => {
    const derived = deriveZcodePersonalConfig(makeConfig(), { providerId: 'p-dp', modelId: 'deepseek-r1' });
    const root = derived.config as Record<string, unknown>;
    expect(root.defaultModelSelection).toEqual({ providerId: 'p-dp', modelId: 'deepseek-r1' });
    expect(root.providerOrder).toEqual(['p-dp', 'p-step']);
    expect((derived as { schemaVersion?: number }).schemaVersion).toBe(1);
  });

  it('resolves the personal config path from the environment override', () => {
    expect(resolveZcodePersonalConfigPath({ ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: 'C:/x.json' } as NodeJS.ProcessEnv)).toBe('C:/x.json');
    const defaultPath = resolveZcodePersonalConfigPath({} as NodeJS.ProcessEnv);
    const segments = defaultPath.split(/[\\/]+/u);
    expect(segments.slice(-3)).toEqual(['.zcode', 'v2', 'provider_config.json']);
  });
});
