// 动态看板列，持久化到 localStorage + Supabase
import { supabase } from '../lib/supabase';

export interface KanbanColumn {
  id: string;
  title: string;
}

const KEY = 'gsyen_kanban_columns';

const DEFAULTS: KanbanColumn[] = [
  { id: 'todo',     title: '预约待编' },
  { id: 'progress', title: '执行中柜' },
  { id: 'review',   title: '评审阶段' },
  { id: 'done',     title: '极速已成' },
];

function load(): KanbanColumn[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULTS;
}

function persist(cols: KanbanColumn[]) {
  localStorage.setItem(KEY, JSON.stringify(cols));
  window.dispatchEvent(new CustomEvent('kanban-columns-updated'));
}

export const kanbanColumnStore = {
  getAll: (): KanbanColumn[] => load(),

  add: (title: string): KanbanColumn => {
    const cols = load();
    const col: KanbanColumn = { id: `col_${Date.now()}`, title };
    const next = [...cols, col];
    persist(next);
    void _upsertCol(col, next.length - 1);
    return col;
  },

  rename: (id: string, title: string) => {
    const cols = load().map(c => c.id === id ? { ...c, title } : c);
    persist(cols);
    const idx = cols.findIndex(c => c.id === id);
    const col = cols[idx];
    if (col) void _upsertCol(col, idx);
  },

  remove: (id: string) => {
    persist(load().filter(c => c.id !== id));
    void _deleteCol(id);
  },

  reorder: (fromId: string, toId: string) => {
    const cols = load();
    const from = cols.findIndex(c => c.id === fromId);
    const to   = cols.findIndex(c => c.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...cols];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
    next.forEach((c, i) => void _upsertCol(c, i));
  },
};

// ── Supabase 双写同步（session_id = '__default__' 区分全局列） ────────────────
let _uid: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

async function _upsertCol(col: KanbanColumn, pos: number) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_kanban_cols').upsert(
    { id: col.id, user_id: _uid, session_id: '__default__', title: col.title, position: pos }
  );
}

async function _deleteCol(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_kanban_cols').delete()
    .eq('id', id).eq('user_id', _uid).eq('session_id', '__default__');
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('gsyen_kanban_cols')
    .select('*').eq('user_id', userId).eq('session_id', '__default__')
    .order('position', { ascending: true });
  if (!data || data.length === 0) return;
  const remote: KanbanColumn[] = data.map((r: any) => ({ id: r.id, title: r.title }));
  const local     = load();
  const remIds    = new Set(remote.map(c => c.id));
  const localOnly = local.filter(c => !remIds.has(c.id));
  for (const [i, c] of localOnly.entries()) await _upsertCol(c, remote.length + i);
  const merged = [...remote, ...localOnly];
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('kanban-columns-updated'));
}

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_kanban_cols_default:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_kanban_cols', filter: `user_id=eq.${uid}` },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});
