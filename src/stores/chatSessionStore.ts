import { ChatMessage, StoredSession } from '../types/chat';
import { supabase } from '../lib/supabase';
import { localVaultService } from '../services/localVaultService';

const SESSIONS_KEY     = 'gsyen_sessions_cache';   // renamed from gsyen_chat_sessions_v1
const CURRENT_CHAT_KEY = 'gsyen_current_chat';
const SYNCED_KEY       = 'gsyen_chat_synced_ids';

// One-time migration from old key name
const _old = localStorage.getItem('gsyen_chat_sessions_v1');
if (_old) {
  localStorage.setItem(SESSIONS_KEY, _old);
  localStorage.removeItem('gsyen_chat_sessions_v1');
}

function getSyncedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY) || '[]')); }
  catch { return new Set(); }
}
function addSyncedId(id: string) {
  const ids = getSyncedIds(); ids.add(id);
  localStorage.setItem(SYNCED_KEY, JSON.stringify([...ids]));
}

// ── Supabase 双写 ─────────────────────────────────────────────────────────────
let _uid: string | null = null;

async function _upsert(s: StoredSession) {
  if (!supabase || !_uid) return;
  const { error } = await supabase.from('gsyen_chat_sessions').upsert({
    id: s.id, user_id: _uid, title: s.title, model: s.model,
    messages: s.messages, updated_at: new Date(s.updatedAt).getTime(),
    team_id: s.teamId ?? null,
  });
  if (error) console.error('[sync] _upsert error', error);
  else addSyncedId(s.id);
}

async function _removeRemote(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_chat_sessions').delete().eq('id', id).eq('user_id', _uid);
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data, error } = await supabase.from('gsyen_chat_sessions')
    .select('*').order('updated_at', { ascending: false }).limit(200);
  if (error) { console.error('[sync] _pull error', error); return; }
  if (!data) return;

  const remote: StoredSession[] = data.map((r: any) => ({
    id: r.id, title: r.title, model: r.model,
    messages: r.messages ?? [],
    updatedAt: new Date(r.updated_at).toISOString(),
    teamId: r.team_id ?? undefined,
  }));

  const local      = chatSessionStore.loadAll();
  const remIds     = new Set(remote.map(s => s.id));
  const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const syncedIds  = getSyncedIds();
  const localOnly  = local.filter(s => !remIds.has(s.id) && UUID_RE.test(s.id) && !s.teamId && !syncedIds.has(s.id));
  for (const s of localOnly) await _upsert(s);
  for (const s of remote) addSyncedId(s.id);

  const merged = [...remote, ...localOnly].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged));

  // New device: auto-restore most recent session so main chat area isn't blank
  const currentChat = localStorage.getItem(CURRENT_CHAT_KEY);
  const hasCurrentChat = currentChat && currentChat !== '[]';
  if (!hasCurrentChat && merged.length > 0) {
    const first = merged[0];
    if (first.messages.length > 0) {
      localStorage.setItem(CURRENT_CHAT_KEY, JSON.stringify(first.messages));
      localStorage.setItem('gsyen_current_session_id', first.id);
    }
  }

  window.dispatchEvent(new CustomEvent('chat-sessions-updated'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_chat_sessions:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_chat_sessions' },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  const newUid = session?.user?.id ?? null;
  if (newUid && newUid !== _uid) {
    _uid = newUid;
    if (_ev === 'SIGNED_IN') window.dispatchEvent(new CustomEvent('gsyen-user-signed-in'));
    _pull(_uid);
    _subscribeRealtime(_uid);
  } else if (!newUid && _uid) {
    _uid = null;
    _rt?.unsubscribe();
    _rt = null;
    const theme    = localStorage.getItem('theme');
    const fontSize = localStorage.getItem('gsyen_font_size');
    localStorage.clear();
    if (theme)    localStorage.setItem('theme', theme);
    if (fontSize) localStorage.setItem('gsyen_font_size', fontSize);
    window.dispatchEvent(new CustomEvent('chat-sessions-updated'));
  } else {
    _uid = newUid;
  }
});

export const chatSessionStore = {
  // ─── Sessions list ───────────────────────────────────────────────────────

  loadAll(): StoredSession[] {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); }
    catch { return []; }
  },

  upsert(id: string, msgs: ChatMessage[], model: string, teamId?: string): StoredSession[] {
    const firstUser = msgs.find(m => m.role === 'user');
    const raw = firstUser?.content ?? '';
    const title = raw.length > 36 ? raw.slice(0, 36) + '…' : raw || '新对话';
    const all = this.loadAll();
    const idx = all.findIndex(s => s.id === id);
    const record: StoredSession = {
      id, title, model, messages: msgs,
      updatedAt: new Date().toISOString(),
      teamId,
    };
    if (idx >= 0) all[idx] = record; else all.unshift(record);
    const sorted = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (_uid) {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sorted));
      _upsert(record);
      // Real-time local vault write (fire and forget)
      localVaultService.saveSession(record);
    }
    return sorted;
  },

  findTeamSession(teamId: string): StoredSession | null {
    return this.loadAll().find(s => s.teamId === teamId) ?? null;
  },

  delete(id: string): StoredSession[] {
    const updated = this.loadAll().filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    _removeRemote(id);
    return updated;
  },

  // ─── Current active chat ─────────────────────────────────────────────────

  loadCurrentChat(): ChatMessage[] {
    try { return JSON.parse(localStorage.getItem(CURRENT_CHAT_KEY) || '[]'); }
    catch { return []; }
  },

  saveCurrentChat(msgs: ChatMessage[]): void {
    if (!_uid) return;
    localStorage.setItem(CURRENT_CHAT_KEY, JSON.stringify(msgs));
  },

  clearCurrentChat(): void {
    localStorage.removeItem(CURRENT_CHAT_KEY);
  },
};
