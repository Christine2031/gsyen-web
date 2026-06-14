import { CredentialRow, LOCAL_STORAGE_KEY } from '../components/passwordVault';
import { supabase } from '../lib/supabase';

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
    save([row, ...load()]);
    void _upsert(row);
  },

  remove(id: string) {
    save(load().filter(r => r.id !== id));
    void _delete(id);
  },

  update(id: string, patch: Partial<CredentialRow>) {
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
}

async function _delete(id: string) {
  if (!supabase || !_uid) return;
  _pendingDeletes.add(id);
  try {
    await supabase.from('gsyen_vault').delete().eq('id', id).eq('user_id', _uid);
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
  const local     = load();
  const remIds    = new Set(remote.map(r => r.id));
  const localOnly = local.filter(r => !remIds.has(r.id));
  for (const row of localOnly) await _upsert(row);
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
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});
