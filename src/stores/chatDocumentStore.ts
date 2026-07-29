import type { ChatDocumentSource } from '../types/chat';

const PREFIX = 'gsyen_chat_local_documents:';

/** Parsed text only, stored locally by chat id and deliberately excluded from Supabase session sync. */
export const chatDocumentStore = {
  load(sessionId: string | null): ChatDocumentSource[] {
    if (!sessionId) return [];
    try { return JSON.parse(localStorage.getItem(PREFIX + sessionId) || '[]'); }
    catch { return []; }
  },

  save(sessionId: string, sources: ChatDocumentSource[]): void {
    try { localStorage.setItem(PREFIX + sessionId, JSON.stringify(sources)); }
    catch (error) { console.warn('[chat-documents] local storage unavailable', error); }
  },

  remove(sessionId: string): void {
    localStorage.removeItem(PREFIX + sessionId);
  },
};
