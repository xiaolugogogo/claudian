import type { ProviderModelCatalogController } from '../../../core/providers/models/ProviderModelCatalog';
import type { ProviderHost } from '../../../core/providers/ProviderHost';
import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { ZcodeCLIResolver } from '../runtime/ZcodeCLIResolver';
import { createZcodeModels, type ZcodeModelCatalogOwner } from '../runtime/ZcodeModels';
import { ZCODE_PROVIDER_ID } from '../settings';
import { zcodeSettingsTabRenderer } from '../ui/ZcodeSettingsTab';

export interface ZcodeWorkspaceServices extends ProviderWorkspaceServices {
  cliResolver: ZcodeCLIResolver;
  modelCatalog: ProviderModelCatalogController;
}

export async function createZcodeWorkspaceServices(_plugin: ProviderHost): Promise<ZcodeWorkspaceServices> {
  const catalogOwner: ZcodeModelCatalogOwner = createZcodeModels(_plugin.getRuntimeHost(ZCODE_PROVIDER_ID));
  return {
    cliResolver: new ZcodeCLIResolver(),
    modelCatalog: catalogOwner.catalog,
    settingsTabRenderer: zcodeSettingsTabRenderer,
  };
}

export const zcodeWorkspaceRegistration: ProviderWorkspaceRegistration<ZcodeWorkspaceServices> = {
  initialize: async ({ plugin }) => createZcodeWorkspaceServices(plugin),
};
