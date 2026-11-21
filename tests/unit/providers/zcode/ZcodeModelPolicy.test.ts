import { describe, expect, it, vi } from 'vitest';

const catalogFixture = [
  { id: 'zcode:p-dp/deepseek-flash', name: 'dp deepseek-flash', providerLabel: 'dp', modelId: 'deepseek-flash' },
  { id: 'zcode:p-dp/deepseek-r1', name: 'dp deepseek-r1', providerLabel: 'dp', modelId: 'deepseek-r1' },
];

vi.mock('@/providers/zcode/runtime/ZcodePersonalConfig', async () => {
  const actual = await vi.importActual<typeof import('@/providers/zcode/runtime/ZcodePersonalConfig')>(
    '@/providers/zcode/runtime/ZcodePersonalConfig',
  );
  return {
    ...actual,
    listZcodeCatalogModels: () => catalogFixture,
  };
});

import {
  parseZcodeModelSelectionId,
  zcodeModelPolicy,
} from '@/providers/zcode/models';

describe('zcode model policy', () => {
  it('always offers the passthrough option first', () => {
    const options = zcodeModelPolicy.getModelOptions({ providerConfigs: { zcode: {} } });
    expect(options[0]).toMatchObject({ value: 'zcode-configured' });
  });

  it('lists visible models with aliases and falls back to discovery order', () => {
    const settings = {
      providerConfigs: {
        zcode: {
          visibleModels: ['zcode:p-dp/deepseek-r1', 'zcode:p-dp/deepseek-flash'],
          modelAliases: { 'zcode:p-dp/deepseek-r1': 'DeepSeek R1' },
        },
      },
    };
    const options = zcodeModelPolicy.getModelOptions(settings);
    expect(options.map(option => option.value)).toEqual([
      'zcode-configured',
      'zcode:p-dp/deepseek-r1',
      'zcode:p-dp/deepseek-flash',
    ]);
    expect(options[1].label).toBe('DeepSeek R1');
  });

  it('falls back to every discovered model when no curation is saved', () => {
    const options = zcodeModelPolicy.getModelOptions({ providerConfigs: { zcode: {} } });
    expect(options.map(option => option.value)).toEqual([
      'zcode-configured',
      'zcode:p-dp/deepseek-flash',
      'zcode:p-dp/deepseek-r1',
    ]);
  });

  it('parses selection ids back into provider/model pairs', () => {
    expect(parseZcodeModelSelectionId('zcode:p-dp/deepseek-flash')).toEqual({ providerId: 'p-dp', modelId: 'deepseek-flash' });
    expect(parseZcodeModelSelectionId('zcode-configured')).toBeNull();
    expect(parseZcodeModelSelectionId(undefined)).toBeNull();
    expect(parseZcodeModelSelectionId('zcode:bad')).toBeNull();
  });

  it('claims ids with the zcode prefix through ownsModel', () => {
    expect(zcodeModelPolicy.ownsModel('zcode:p-dp/deepseek-flash', { providerConfigs: {} })).toBe(true);
    expect(zcodeModelPolicy.ownsModel('zcode-configured', { providerConfigs: {} })).toBe(true);
    expect(zcodeModelPolicy.ownsModel('opencode/deepseek-v4.1-flash', { providerConfigs: {} })).toBe(false);
  });
});
