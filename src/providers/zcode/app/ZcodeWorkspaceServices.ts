import type { ProviderHost } from '../../../core/providers/ProviderHost';
import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { ZcodeCLIResolver } from '../runtime/ZcodeCLIResolver';
import { zcodeSettingsTabRenderer } from '../ui/ZcodeSettingsTab';

export interface ZcodeWorkspaceServices extends ProviderWorkspaceServices {
  cliResolver: ZcodeCLIResolver;
}

export async function createZcodeWorkspaceServices(_plugin: ProviderHost): Promise<ZcodeWorkspaceServices> {
  return {
    cliResolver: new ZcodeCLIResolver(),
    settingsTabRenderer: zcodeSettingsTabRenderer,
  };
}

export const zcodeWorkspaceRegistration: ProviderWorkspaceRegistration<ZcodeWorkspaceServices> = {
  initialize: async ({ plugin }) => createZcodeWorkspaceServices(plugin),
};
