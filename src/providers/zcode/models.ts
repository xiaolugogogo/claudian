import type { ProviderModelPolicy, ProviderUIOption } from '../../core/providers/types';
import {
  ZCODE_MODEL_ID_PREFIX,
  type ZcodeModelSelection,
} from './runtime/ZcodePersonalConfig';
import { listZcodeCatalogModels } from './runtime/ZcodePersonalConfig';
import { getZcodeProviderSettings } from './settings';

/**
 * The passthrough option keeps today's behavior: the spawned CLI uses ZCode's
 * own default-model state untouched. Concrete selections are encoded as
 * `zcode:<providerId>/<modelId>` and applied per turn through a derived
 * personal config file, so two conversations can run different models.
 */
export const ZCODE_FOLLOW_CONFIG_MODEL_ID = 'zcode-configured';

export function parseZcodeModelSelectionId(model: string | undefined): ZcodeModelSelection | null {
  if (!model || !model.startsWith(ZCODE_MODEL_ID_PREFIX)) return null;
  const composite = model.slice(ZCODE_MODEL_ID_PREFIX.length);
  const separator = composite.indexOf('/');
  if (separator <= 0) return null;
  const providerId = composite.slice(0, separator);
  const modelId = composite.slice(separator + 1);
  if (!providerId || !modelId) return null;
  return { providerId, modelId };
}

export const zcodeModelPolicy: ProviderModelPolicy = {
  getModelOptions(settings): ProviderUIOption[] {
    const current = getZcodeProviderSettings(settings);
    const options: ProviderUIOption[] = [{
      value: ZCODE_FOLLOW_CONFIG_MODEL_ID,
      label: 'Follow ZCode config',
      description: 'Uses the default model selected by ZCode itself',
    }];
    const discovered = new Map(listZcodeCatalogModels().map(entry => [entry.id, entry]));
    const visible = current.visibleModels ?? [...discovered.keys()];
    for (const id of visible) {
      const entry = discovered.get(id);
      if (!entry || options.some(option => option.value === id)) continue;
      options.push({
        value: id,
        label: Object.hasOwn(current.modelAliases, id) ? current.modelAliases[id] : entry.name,
        description: `${entry.providerLabel} / ${entry.modelId}`,
      });
    }
    return options;
  },

  getDefaultModel() {
    return ZCODE_FOLLOW_CONFIG_MODEL_ID;
  },

  ownsModel(model: string): boolean {
    return model === ZCODE_FOLLOW_CONFIG_MODEL_ID || model.startsWith(ZCODE_MODEL_ID_PREFIX);
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
    return model === ZCODE_FOLLOW_CONFIG_MODEL_ID;
  },

  applyModelDefaults(_model: string, _settings: unknown): void {
    // Selections are passthrough ids; no provider-side defaults to apply.
  },

  normalizeModelVariant(model: string): string {
    return model;
  },
};
