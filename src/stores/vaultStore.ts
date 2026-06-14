import { CredentialRow, LOCAL_STORAGE_KEY } from '../components/passwordVault';
import { supabase } from '../lib/supabase';

const SYNCED_KEY = 'gsyen_vault_synced_ids';
function getSyncedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY) || '[]')); }
  catch { return new Set(); }
}
function addSyncedId(id: string) {
  const ids = getSyncedIds(); ids.add(id);
  localStorage.setItem(SYNCED_KEY, JSON.stringify([...ids]));
}

function load(): CredentialRow[] {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (saved) { try { return JSON.parse(saved); } catch {} }
  return [];
}

function save(rows: CredentialRow[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event('vault-updated'));
}

export const vaultStore = {
  getAll: (): CredentialRow[] => load(),

  add(row: CredentialRow) {
    if (!_uid) return;
    save([row, ...load()]);
    void _upsert(row);
  },

  remove(id: string) {
    const before = load();
    console.log('[vault] remove id:', id, '| local ids:', before.map(r => r.id));
    save(before.filter(r => r.id !== id));
    void _delete(id);
  },

  update(id: string, patch: Partial<CredentialRow>) {
    if (!_uid) return;
    const rows = load().map(r => r.id === id ? { ...r, ...patch } : r);
    save(rows);
    const updated = rows.find(r => r.id === id);
    if (updated) void _upsert(updated);
  },
};

// ── Supabase 双写同步（整行作为 jsonb，HTTPS 传输） ─────────────────────────
let _uid: string | null = null;
const _pendingDeletes = new Set<string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

async function _upsert(row: CredentialRow) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_vault').upsert(
    { id: row.id, user_id: _uid, data: row, updated_at: new Date().toISOString() }
  );
  addSyncedId(row.id);
}

async function _delete(id: string) {
  if (!supabase || !_uid) return;
  _pendingDeletes.add(id);
  try {
    const { error } = await supabase.from('gsyen_vault').delete().eq('id', id).eq('user_id', _uid);
    if (error) console.error('[vault] _delete error', id, error);
    else console.log('[vault] _delete ok', id);
  } finally {
    _pendingDeletes.delete(id);
  }
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('gsyen_vault').select('*').eq('user_id', userId);
  if (!data) return;
  const remote: CredentialRow[] = data
    .map((r: any) => r.data as CredentialRow)
    .filter(r => !_pendingDeletes.has(r.id));
  const local      = load();
  const remIds     = new Set(remote.map(r => r.id));
  const syncedIds  = getSyncedIds();
  const localOnly  = local.filter(r => !remIds.has(r.id) && !syncedIds.has(r.id));
  for (const row of localOnly) await _upsert(row);
  for (const r of remote) addSyncedId(r.id);
  save([...remote, ...localOnly]);
}

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_vault:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_vault', filter: `user_id=eq.${uid}` },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  const newUid = session?.user?.id ?? null;
  if (newUid && newUid !== _uid) {
    _uid = newUid;
    _pull(_uid);
    _subscribeRealtime(_uid);
  } else if (!newUid && _uid) {
    _uid = null;
    _rt?.unsubscribe();
    _rt = null;
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(SYNCED_KEY);
    window.dispatchEvent(new Event('vault-updated'));
  } else {
    _uid = newUid;
  }
});
