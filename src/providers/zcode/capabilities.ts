import type { ProviderCapabilities } from '../../core/providers/types';

/**
 * ZCode headless has no interactive approval client and no native fork/rewind
 * surface exposed through the CLI stream, so those features stay off.
 */
export const ZCODE_PROVIDER_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  providerId: 'zcode',
  supportsResponseThroughput: false,
  supportsNativeHistory: true,
  supportsEphemeralSessions: false,
  supportsRewind: false,
  supportsFork: false,
  supportsProviderCommands: false,
  supportsImageAttachments: false,
  supportsTurnSteer: false,
  reasoningControl: 'none',
});
