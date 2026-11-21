import type { ProviderChatUIConfig } from '../../../core/providers/types';
import { ZCODE_PROVIDER_ICON } from '../../../shared/icons';
import { zcodeModelPolicy } from '../models';
import {
  ZCODE_PERMISSION_MODES,
  type ZcodePermissionMode,
} from '../permissionModes';

export const zcodeChatUIConfig: ProviderChatUIConfig = {
  ...zcodeModelPolicy,
  getPermissionModeOptions() {
    return ZCODE_PERMISSION_MODES.map((mode) => {
      const descriptions: Record<ZcodePermissionMode, string> = {
        edit: 'Approve file edits automatically; other tools fail closed',
        plan: 'Read-only analysis; writes and commands fail closed',
        yolo: 'Approve all tools without asking (headless has no approval client)',
      };
      return {
        value: mode,
        label: mode === 'yolo' ? 'YOLO' : mode === 'edit' ? 'Edit' : 'Plan',
        description: descriptions[mode],
        ...(mode === 'yolo' ? { bypassesApprovals: true } : {}),
      };
    });
  },
  getProviderIcon() {
    return ZCODE_PROVIDER_ICON;
  },
};
