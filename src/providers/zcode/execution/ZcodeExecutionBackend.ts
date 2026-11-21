import type {
  ProviderExecutionBackend as ProviderExecutionBackendContract,
  ProviderExecutionSession,
  ProviderSessionConfig,
} from '@/core/execution';
import type { ProviderRuntimeHost } from '@/core/providers/ProviderRuntimeHost';

import { ZcodeExecutionSession } from './ZcodeExecutionSession';

/** Cheap factory: ZCode sessions own no runtime until a turn spawns one. */
export class ZcodeExecutionBackend implements ProviderExecutionBackendContract {
  readonly providerId = 'zcode' as const;

  constructor(private readonly host: ProviderRuntimeHost) {}

  createSession(config: ProviderSessionConfig): ProviderExecutionSession {
    return new ZcodeExecutionSession(this.host, config);
  }
}
