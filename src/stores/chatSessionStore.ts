import { ChatMessage, StoredSession } from '../types/chat';
import { supabase } from '../lib/supabase';

const SESSIONS_KEY    = 'gsyen_chat_sessions_v1';
const CURRENT_CHAT_KEY = 'atelier_ai_chat';

// ── Supabase 双写 ─────────────────────────────────────────────────────────────
let _uid: string | null = null;

async function _upsert(s: StoredSession) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_chat_sessions').upsert({
    id: s.id, user_id: _uid, title: s.title, model: s.model,
    messages: s.messages, updated_at: new Date(s.updatedAt).toISOString(),
  });
}

async function _removeRemote(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_chat_sessions').delete().eq('id', id).eq('user_id', _uid);
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('gsyen_chat_sessions')
    .select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  if (!data) return;
  const remote: StoredSession[] = data.map((r: any) => ({
    id: r.id, title: r.title, model: r.model,
    messages: r.messages ?? [], updatedAt: new Date(r.updated_at).toISOString(),
  }));
  const local    = chatSessionStore.loadAll();
  const remIds   = new Set(remote.map(s => s.id));
  const localOnly = local.filter(s => !remIds.has(s.id));
  for (const s of localOnly) await _upsert(s);
  const merged = [...remote, ...localOnly].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('chat-sessions-updated'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_chat_sessions:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_chat_sessions', filter: `user_id=eq.${uid}` },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});

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
    const record: StoredSession = { id, title, model, messages: msgs, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = record; else all.unshift(record);
    const sorted = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sorted));
    _upsert(record);
    return sorted;
  },

  delete(id: string): StoredSession[] {
    const updated = this.loadAll().filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    _removeRemote(id);
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
