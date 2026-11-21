import type {
  ProviderConversationHistoryService,
  ProviderConversationSessionAvailability,
  ProviderHistoryInput,
  ProviderHistoryUpdate,
} from '../../../core/providers/types';
import {
  readZcodeHistoryRevision,
  readZcodeNativeHistory,
  zcodeSessionDbExists,
  zcodeSessionExists,
} from './ZcodeHistoryStore';

/**
 * Hydrates conversation history from ZCode's session database (read-only
 * `node:sqlite` access). Claudian renders history from the repository's
 * messages; ZCode's native store is the single source of truth, so a
 * conversation open rebuilds its transcript from the session database.
 */
export class ZcodeConversationHistoryService implements ProviderConversationHistoryService {
  async hydrateConversationHistory(
    conversation: ProviderHistoryInput,
  ): Promise<ProviderHistoryUpdate> {
    if (!conversation.sessionId) return {};
    const messages = readZcodeNativeHistory(conversation.sessionId);
    if (messages.length === 0) return {};
    return { messages };
  }

  readNativeHistoryRevision(
    conversation: ProviderHistoryInput,
  ): Promise<string | null> {
    return Promise.resolve(
      conversation.sessionId ? readZcodeHistoryRevision(conversation.sessionId) : null,
    );
  }

  getConversationSessionAvailability(
    conversation: ProviderHistoryInput,
  ): Promise<ProviderConversationSessionAvailability> {
    if (!conversation.sessionId || !zcodeSessionDbExists()) return Promise.resolve('unknown');
    return Promise.resolve(zcodeSessionExists(conversation.sessionId) ? 'available' : 'missing');
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
