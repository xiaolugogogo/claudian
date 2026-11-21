import { getInstallationKey } from '@/core/device/InstallationKey';
import {
  decodeInstallationSettings,
  type InstallationSettings,
  selectInstallationSettings,
  type StoredInstallationSettings,
  updateInstallationSettings,
} from '@/core/providers/settings/InstallationSettings';

import { replaceProviderConfig } from '../../core/providers/providerConfig';
import type { ProviderSelectionInputs } from '../../core/providers/ProviderRuntimeHost';
import { normalizeHostnameStringMap } from '../../core/providers/settings/HostnameStringMap';
import type { HostnameCLIPaths } from '../../core/types/settings';

export interface PersistedZcodeProviderSettings extends StoredInstallationSettings {
  /** Explicit CLI path for this host: a `zcode` executable or a `zcode.cjs` bundle. cliPathsByHost wins. */
  cliPath: string;
  cliPathsByHost: HostnameCLIPaths;
  enabled: boolean;
  environmentHash: string;
  environmentVariables: string;
}

export interface ZcodeProviderSettings extends PersistedZcodeProviderSettings, InstallationSettings {
}

export const DEFAULT_ZCODE_PROVIDER_SETTINGS: Readonly<PersistedZcodeProviderSettings> = Object.freeze({
  cliPath: '',
  cliPathsByHost: {},
  enabled: false,
  environmentHash: '',
  environmentVariables: '',
  installationMethodsByHost: {},
  wslDistroOverridesByHost: {},
});

export function decodeZcodeConfig(
  config: Readonly<Record<string, unknown>>,
  _selection: Pick<ProviderSelectionInputs, 'referencedModelIds'>,
): ZcodeProviderSettings {
  const installation = decodeInstallationSettings(config);
  return {
    ...installation,
    ...selectInstallationSettings(installation, getInstallationKey()),
    cliPath: readTrimmedString(config.cliPath),
    cliPathsByHost: normalizeHostnameStringMap(config.cliPathsByHost),
    enabled: typeof config.enabled === 'boolean' ? config.enabled : DEFAULT_ZCODE_PROVIDER_SETTINGS.enabled,
    environmentHash: readTrimmedString(config.environmentHash),
    environmentVariables: typeof config.environmentVariables === 'string' ? config.environmentVariables : '',
  };
}

/** Applies updates to a stored configuration in place. */
export function updateZcodeConfig(
  config: Record<string, unknown>,
  selection: Pick<ProviderSelectionInputs, 'referencedModelIds'>,
  updates: Partial<ZcodeProviderSettings>,
): ZcodeProviderSettings {
  const current = decodeZcodeConfig(config, selection);
  const hostKey = getInstallationKey();
  let cliPathsByHost = updates.cliPathsByHost !== undefined
    ? normalizeHostnameStringMap(updates.cliPathsByHost)
    : { ...current.cliPathsByHost };
  let cliPath = current.cliPath;
  if ('cliPath' in updates && updates.cliPathsByHost === undefined) {
    const hostCliPath = readTrimmedString(updates.cliPath);
    cliPathsByHost = { ...cliPathsByHost };
    if (hostCliPath) cliPathsByHost[hostKey] = hostCliPath;
    else delete cliPathsByHost[hostKey];
    cliPath = '';
  } else if (updates.cliPathsByHost !== undefined) {
    cliPath = readTrimmedString(updates.cliPath);
  }
  const installation = updateInstallationSettings(current, updates, hostKey);
  const next: PersistedZcodeProviderSettings = {
    cliPath,
    cliPathsByHost,
    enabled: updates.enabled ?? current.enabled,
    environmentHash: updates.environmentHash !== undefined
      ? readTrimmedString(updates.environmentHash)
      : current.environmentHash,
    environmentVariables: updates.environmentVariables ?? current.environmentVariables,
    installationMethodsByHost: installation.installationMethodsByHost,
    wslDistroOverridesByHost: installation.wslDistroOverridesByHost,
  };
  replaceProviderConfig(config, next as unknown as Record<string, unknown>);
  return { ...next, ...selectInstallationSettings(next, hostKey) };
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
