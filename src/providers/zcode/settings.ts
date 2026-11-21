import { getProviderConfig, getProviderSelectionInputs, setProviderConfig } from '../../core/providers/providerConfig';
import {
  decodeZcodeConfig,
  updateZcodeConfig,
  type ZcodeProviderSettings,
} from './config';

export const ZCODE_PROVIDER_ID = 'zcode' as const;

/** Reads ZCode's configuration from the settings document. */
export function getZcodeProviderSettings(settings: Record<string, unknown>): ZcodeProviderSettings {
  return decodeZcodeConfig(
    getProviderConfig(settings, ZCODE_PROVIDER_ID),
    getProviderSelectionInputs(settings, ZCODE_PROVIDER_ID),
  );
}

/** Writes ZCode's configuration into the settings document. */
export function updateZcodeProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<ZcodeProviderSettings>,
): ZcodeProviderSettings {
  const config = getProviderConfig(settings, ZCODE_PROVIDER_ID);
  const next = updateZcodeConfig(config, getProviderSelectionInputs(settings, ZCODE_PROVIDER_ID), updates);
  setProviderConfig(settings, ZCODE_PROVIDER_ID, config);
  return next;
}
