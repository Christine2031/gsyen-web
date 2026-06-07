import { ChatMessage, StoredSession } from '../types/chat';

const SESSIONS_KEY    = 'gsyen_chat_sessions_v1';
const CURRENT_CHAT_KEY = 'atelier_ai_chat';

export const chatSessionStore = {
  // ─── Sessions list ───────────────────────────────────────────────────────

  loadAll(): StoredSession[] {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    } catch {
      return [];
    }
  },

  /** Insert or update a session, re-sorts by updatedAt desc */
  upsert(id: string, msgs: ChatMessage[], model: string): StoredSession[] {
    const firstUser = msgs.find(m => m.role === 'user');
    const raw = firstUser?.content ?? '';
    const title = raw.length > 36 ? raw.slice(0, 36) + '…' : raw || '新对话';

    const all = this.loadAll();
    const idx = all.findIndex(s => s.id === id);
    const record: StoredSession = {
      id,
      title,
      model,
      messages: msgs,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) all[idx] = record; else all.unshift(record);
    const sorted = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sorted));
    return sorted;
  },

  delete(id: string): StoredSession[] {
    const updated = this.loadAll().filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    return updated;
  },

  // ─── Current active chat ─────────────────────────────────────────────────

  loadCurrentChat(): ChatMessage[] {
    try {
      return JSON.parse(localStorage.getItem(CURRENT_CHAT_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveCurrentChat(msgs: ChatMessage[]): void {
    localStorage.setItem(CURRENT_CHAT_KEY, JSON.stringify(msgs));
  },

  clearCurrentChat(): void {
    localStorage.removeItem(CURRENT_CHAT_KEY);
  },
};
