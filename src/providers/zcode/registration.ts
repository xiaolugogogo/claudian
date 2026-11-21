import { NOOP_TASK_RESULT_INTERPRETER } from '../../core/providers/NoopTaskResultInterpreter';
import { getProviderConfig } from '../../core/providers/providerConfig';
import { hasStoredConfigNormalization } from '../../core/providers/settings/storedSettings';
import type { ProviderModule } from '../../core/providers/types';
import { zcodeWorkspaceRegistration } from './app/ZcodeWorkspaceServices';
import { ZCODE_PROVIDER_CAPABILITIES } from './capabilities';
import { zcodeSettingsReconciler } from './env/ZcodeSettingsReconciler';
import { ZcodeExecutionBackend } from './execution/ZcodeExecutionBackend';
import { ZcodeConversationHistoryService } from './history/ZcodeConversationHistoryService';
import { zcodeModelPolicy } from './models';
import {
  getZcodeProviderSettings,
  updateZcodeProviderSettings,
  ZCODE_PROVIDER_ID,
} from './settings';
import { zcodeChatUIConfig } from './ui/ZcodeChatUIConfig';

export const zcodeProviderRegistration: ProviderModule = {
  id: ZCODE_PROVIDER_ID,
  blankTabOrder: 15,
  capabilities: ZCODE_PROVIDER_CAPABILITIES,
  chatUIConfig: zcodeChatUIConfig,
  createExecutionBackend: plugin => new ZcodeExecutionBackend(plugin.getRuntimeHost(ZCODE_PROVIDER_ID)),
  displayName: 'ZCode',
  environmentKeyPatterns: [/^ZCODE_/i],
  historyService: new ZcodeConversationHistoryService(),
  isEnabled: settings => getZcodeProviderSettings(settings).enabled,
  modelPolicy: zcodeModelPolicy,
  setEnabled: (settings, enabled) => {
    updateZcodeProviderSettings(settings, { enabled });
  },
  settingsReconciler: zcodeSettingsReconciler,
  settingsStorage: {
    normalizeStored(target, stored) {
      const storedConfig = getProviderConfig(stored, ZCODE_PROVIDER_ID);
      const current = getZcodeProviderSettings(stored);
      updateZcodeProviderSettings(target, { ...current });
      return hasStoredConfigNormalization(storedConfig, getProviderConfig(target, ZCODE_PROVIDER_ID));
    },
  },
  taskResultInterpreter: NOOP_TASK_RESULT_INTERPRETER,
  workspace: zcodeWorkspaceRegistration,
};
