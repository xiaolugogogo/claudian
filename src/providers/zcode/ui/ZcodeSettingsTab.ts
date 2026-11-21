import * as fs from 'node:fs';
import * as path from 'node:path';

import { normalizeConfiguredCLIPath } from '@/core/process/cliPath';
import { type CLIInstallation, probeCLIInstallation } from '@/core/providers/cli/CLIInstallationProbe';
import { getRuntimeEnvironmentText } from '@/core/providers/providerEnvironment';
import { ZCODE_PROVIDER_ICON } from '@/shared/icons';
import { renderCLIInstallationSetting } from '@/shared/settings/CLIInstallationSetting';

import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import type { ClaudianSettings } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { renderEnvironmentSettingsSection } from '../../../shared/settings/EnvironmentSettingsSection';
import type { ProviderEnablementSettingOptions } from '../../../shared/settings/ProviderEnablementSetting';
import { renderLastEnabledProviderWarning } from '../../../shared/settings/ProviderModelEnablementWarning';
import { buildZcodeRuntimeEnv } from '../runtime/ZcodeRuntimeEnvironment';
import {
  getZcodeProviderSettings,
  updateZcodeProviderSettings,
  ZCODE_PROVIDER_ID,
} from '../settings';

const DISPLAY_NAME = 'ZCode';

function nativeCLIPlaceholder(): string {
  return process.platform === 'win32'
    ? 'C:/Tools/ZCode/resources/glm/zcode.cjs'
    : '~/.zcode/bin/zcode';
}

export const zcodeSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const hostnameKey = context.plugin.storage.installationKey;
    const workspace = ProviderWorkspaceRegistry.requireServices(ZCODE_PROVIDER_ID);

    const enablement: Omit<ProviderEnablementSettingOptions, 'container' | 'description'> = {
      getValue: () => getZcodeProviderSettings(settingsBag).enabled,
      name: t('settings.providerEnablement.name', { provider: DISPLAY_NAME }),
      onChange: async (enabled) => {
        if (!ProviderSettingsCoordinator.canApplyProviderEnablement(settingsBag, ZCODE_PROVIDER_ID, enabled)) {
          lastProviderWarning.showFor();
          return;
        }
        await context.plugin.runProviderExecutionTransition(
          [ZCODE_PROVIDER_ID],
          async () => context.plugin.mutateSettings((settings) => {
            ProviderSettingsCoordinator.applyProviderEnablement(settings, ZCODE_PROVIDER_ID, enabled);
          }),
        );
      },
    };

    const installationContainer = container.createDiv();
    const lastProviderWarning = renderLastEnabledProviderWarning(container);
    renderCLIInstallationSetting({
      cliName: DISPLAY_NAME,
      container: installationContainer,
      enablement,
      getValue: () => {
        const current = getZcodeProviderSettings(settingsBag);
        return current.cliPathsByHost[hostnameKey] ?? current.cliPath ?? '';
      },
      icon: ZCODE_PROVIDER_ICON,
      inspect: async () => {
        const settings = context.plugin.settings as unknown as Record<string, unknown>;
        const config = getZcodeProviderSettings(settings);
        const configuredPath = config.cliPathsByHost[hostnameKey] || config.cliPath;
        const resolved = await context.plugin.getResolvedProviderCliPath(ZCODE_PROVIDER_ID);
        const env = buildZcodeRuntimeEnv(getRuntimeEnvironmentText(settings, ZCODE_PROVIDER_ID), resolved ?? '');
        return probeZcodeCLI(configuredPath, resolved, env);
      },
      name: t('settings.cliPath.genericName'),
      onChange: async (value) => {
        const cliPathsByHost = { ...getZcodeProviderSettings(settingsBag).cliPathsByHost };
        if (value) cliPathsByHost[hostnameKey] = value;
        else delete cliPathsByHost[hostnameKey];
        await context.plugin.applyProviderRuntimeSettings(
          [ZCODE_PROVIDER_ID],
          (settings: ClaudianSettings) => {
            updateZcodeProviderSettings(settings, { cliPath: '', cliPathsByHost });
          },
          () => {
            (workspace as { cliResolver?: { reset(): void } }).cliResolver?.reset();
          },
        );
      },
      placeholder: nativeCLIPlaceholder(),
      validate: validateZcodeCLIPath,
    });

    renderEnvironmentSettingsSection({
      container,
      desc: t('settings.zcode.environment.desc'),
      heading: t('settings.environment'),
      name: t('settings.zcode.environment.name'),
      placeholder: 'ZCODE_DATA_BASE_DIR=your-dir',
      plugin: context.plugin,
      scope: 'provider:zcode',
    });
  },
};

/** Probes the ZCode CLI entry, wrapping `.cjs` bundles with a Node interpreter. */
async function probeZcodeCLI(configuredPath: string, resolvedPath: string | null, env: NodeJS.ProcessEnv): Promise<CLIInstallation> {
  const path = resolvedPath ?? configuredPath;
  if (!path) return { path: null, source: 'auto', version: null };
  const isBundle = path.toLowerCase().endsWith('.cjs');
  return probeCLIInstallation({
    args: ['--version'],
    configuredPath,
    env,
    ...(isBundle ? {
      prepareLaunch: options => ({
        ...options,
        args: [path, ...options.args],
        command: process.execPath,
        env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
      }),
    } : {}),
    path,
  });
}

function validateZcodeCLIPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const expandedPath = normalizeConfiguredCLIPath(trimmed);
  if (!path.posix.isAbsolute(expandedPath) && !path.win32.isAbsolute(expandedPath)) {
    return t('settings.cliPath.validation.mustBeAbsolute');
  }
  try {
    if (!fs.existsSync(expandedPath)) return t('settings.cliPath.validation.notExist');
    if (!fs.statSync(expandedPath).isFile()) return t('settings.cliPath.validation.notFile');
    if (process.platform !== 'win32') fs.accessSync(expandedPath, fs.constants.X_OK);
  } catch {
    return process.platform === 'win32'
      ? t('settings.cliPath.validation.notAccessible')
      : t('settings.cliPath.validation.notExecutable');
  }
  return null;
}
