import type { ProviderUIOption } from '../../core/providers/types';

/**
 * The ZCode CLI has no `--model` flag: model selection lives in the user's
 * `~/.zcode/v2/provider_config.json` and is shared with the desktop app. The
 * chat selector therefore offers one passthrough option instead of a catalog.
 */
export const ZCODE_DEFAULT_MODEL_ID = 'zcode-configured';

export function createZcodeModelPolicy() {
  const options: ProviderUIOption[] = [{
    value: ZCODE_DEFAULT_MODEL_ID,
    label: 'Follow ZCode config',
    description: 'Uses the model configured in ~/.zcode/v2/provider_config.json',
  }];
  return {
    getModelOptions() {
      return options;
    },
    getDefaultModel() {
      return ZCODE_DEFAULT_MODEL_ID;
    },
    ownsModel(model: string): boolean {
      return model === ZCODE_DEFAULT_MODEL_ID;
    },
    supportsReasoningEffort() {
      return false;
    },
    getReasoningOptions() {
      return [];
    },
    getDefaultReasoningValue() {
      return 'default';
    },
    isDefaultModel(model: string): boolean {
      return model === ZCODE_DEFAULT_MODEL_ID;
    },
    applyModelDefaults(_model: string, _settings: unknown): void {
      // Single passthrough model: no side effects.
    },
    normalizeModelVariant(model: string): string {
      return model === ZCODE_DEFAULT_MODEL_ID ? model : ZCODE_DEFAULT_MODEL_ID;
    },
  };
}

export const zcodeModelPolicy = createZcodeModelPolicy();
