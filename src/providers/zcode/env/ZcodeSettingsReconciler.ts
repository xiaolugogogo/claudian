import type {
  ProviderEnvironmentReconciliation,
  ProviderSettingsReconciler,
} from '../../../core/providers/types';

/**
 * ZCode reads model selection from its own config file, so nothing in the
 * environment reconciles Claudian-side; the runtime fingerprint only gates
 * settings bookkeeping.
 */
export const zcodeSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(): ProviderEnvironmentReconciliation {
    return { changed: false };
  },
};
