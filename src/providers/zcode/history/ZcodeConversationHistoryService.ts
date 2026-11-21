import type {
  ProviderConversationHistoryService,
  ProviderHistoryInput,
  ProviderHistoryUpdate,
} from '../../../core/providers/types';

/**
 * Lenient history service for the per-turn ZCode provider. Claudian stores the
 * full transcript in its own conversation records; the native session lives in
 * ZCode's SQLite store and is resumed through `--resume`, so hydration has
 * nothing to replay from native history. Availability stays `unknown` because
 * the provider cannot cheaply probe ZCode's session database.
 */
export class ZcodeConversationHistoryService implements ProviderConversationHistoryService {
  async hydrateConversationHistory(
    _conversation: ProviderHistoryInput,
  ): Promise<ProviderHistoryUpdate> {
    return {};
  }

  readNativeHistoryRevision(): Promise<string | null> {
    return Promise.resolve(null);
  }

  resolveSessionIdForConversation(conversation: ProviderHistoryInput | null): string | null {
    return conversation?.sessionId ?? null;
  }

  isPendingForkConversation(_conversation: ProviderHistoryInput): boolean {
    return false;
  }

  buildForkProviderState(): Record<string, unknown> {
    return {};
  }
}
