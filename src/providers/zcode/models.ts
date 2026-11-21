import type { ProviderModelPolicy, ProviderUIOption } from '../../core/providers/types';
import {
  ZCODE_MODEL_ID_PREFIX,
  type ZcodeModelSelection,
} from './runtime/ZcodePersonalConfig';
import { listZcodeCatalogModels } from './runtime/ZcodePersonalConfig';
import { getZcodeProviderSettings } from './settings';

/**
 * ZCode has no per-turn `--model` flag: a concrete selection is applied per
 * turn through a derived personal config file, so conversations can run
 * different models without touching the user's global configuration.
 */
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
    const discovered = new Map(listZcodeCatalogModels().map(entry => [entry.id, entry]));
    const visible = current.visibleModels ?? [...discovered.keys()];
    const options: ProviderUIOption[] = [];
    for (const id of visible) {
      const entry = discovered.get(id);
      if (!entry || options.some(option => option.value === id)) continue;
      options.push({
        value: id,
        group: entry.providerLabel,
        label: Object.hasOwn(current.modelAliases, id) ? current.modelAliases[id] : entry.modelId,
      });
    }
    return options;
  },

  getDefaultModel(settings) {
    const current = getZcodeProviderSettings(settings);
    const discovered = new Set(listZcodeCatalogModels().map(entry => entry.id));
    const visible = current.visibleModels ?? [...discovered];
    return visible.find(id => discovered.has(id)) ?? null;
  },

  ownsModel(model: string): boolean {
    return model.startsWith(ZCODE_MODEL_ID_PREFIX);
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

  isDefaultModel(): boolean {
    return false;
  },

  applyModelDefaults(_model: string, _settings: unknown): void {
    // Selections are passthrough ids; no provider-side defaults to apply.
  },

  normalizeModelVariant(model: string): string {
    return model;
  },
};
