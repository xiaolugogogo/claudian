import { createConfigCatalogStore, ProviderModelCatalogController } from '../../../core/providers/models/ProviderModelCatalog';
import type { ProviderRuntimeHost } from '../../../core/providers/ProviderRuntimeHost';
import type { ProviderModelCatalogRefreshResult } from '../../../core/providers/types';
import { decodeZcodeConfig, updateZcodeConfig } from '../config';
import { listZcodeCatalogModels } from './ZcodePersonalConfig';

export interface ZcodeModelCatalogOwner {
  catalog: ProviderModelCatalogController;
  dispose(): Promise<void>;
}

/**
 * Live model discovery: every snapshot read parses ZCode's personal provider
 * config, so edits made in the ZCode desktop app show up on the next render.
 */
export function createZcodeModels(host: ProviderRuntimeHost): ZcodeModelCatalogOwner {
  return {
    catalog: new ProviderModelCatalogController({
      providerName: 'ZCode',
      store: createConfigCatalogStore(host, {
        read: (config, selection) => {
          const current = decodeZcodeConfig(config, selection);
          return {
            aliases: current.modelAliases,
            enabled: current.enabled,
            models: listZcodeCatalogModels().map(entry => ({
              id: entry.id,
              name: entry.name,
              providerLabel: entry.providerLabel,
            })),
            selectedIds: current.visibleModels ?? [],
          };
        },
        update: updateZcodeConfig,
      }),
      discover: async (_signal): Promise<ProviderModelCatalogRefreshResult> => {
        // Discovery is a live file read; success is simply "the config parsed".
        return { changed: listZcodeCatalogModels().length > 0 };
      },
    }),
    dispose: () => Promise.resolve(),
  };
}
