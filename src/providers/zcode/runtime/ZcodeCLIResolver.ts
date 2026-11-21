import { CachedProviderCLIResolver } from '../../../core/providers/cli/CachedProviderCLIResolver';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { getZcodeProviderSettings } from '../settings';

/**
 * Resolves the configured or discovered ZCode CLI entry. The resolved path is
 * either a standalone `zcode` executable (SEA) or a `zcode.cjs` bundle that
 * ZcodeLaunchSpec runs through Node or the host's Electron binary.
 */
export class ZcodeCLIResolver {
  private readonly resolver = new CachedProviderCLIResolver({
    binaryName: 'zcode',
    getSettingsProjection: (settings) => {
      const providerSettings = getZcodeProviderSettings(settings);
      return {
        cliPathsByHost: providerSettings.cliPathsByHost,
        environmentText: getRuntimeEnvironmentText(settings, 'zcode'),
        legacyCliPath: providerSettings.cliPath,
      };
    },
    providerId: 'zcode',
  });

  resolveFromSettings(settings: Record<string, unknown>): string | null {
    return this.resolver.resolveFromSettings(settings);
  }

  reset(): void {
    this.resolver.reset();
  }
}
