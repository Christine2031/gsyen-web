/**
 * canvasStore — CANVAS 文档/画板持久化
 * 每条记录 = 一个 MD 文档或画板，存 localStorage + Supabase。
 */
import { supabase } from '../lib/supabase';

const KEY = 'gsyen_canvas_docs';

export type CanvasType = 'doc' | 'canvas' | 'nodes';

export interface CanvasDoc {
  id:        string;
  title:     string;
  content:   string;
  type:      CanvasType;
  scope:     'self' | 'shared';
  createdAt: string;
  updatedAt: string;
  tags?:     string[];
}

function load(): CanvasDoc[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function save(docs: CanvasDoc[]) {
  localStorage.setItem(KEY, JSON.stringify(docs));
  window.dispatchEvent(new Event('canvas-updated'));
}

export const canvasStore = {
  getAll:    (): CanvasDoc[] => load(),
  getById:   (id: string)    => load().find(d => d.id === id),
  getRecent: (n = 5)         => load().slice(0, n),

  add(doc: CanvasDoc) {
    save([doc, ...load()]);
    void _upsert(doc);
  },

  update(id: string, patch: Partial<CanvasDoc>) {
    const docs = load().map(d => d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d);
    save(docs);
    const updated = docs.find(d => d.id === id);
    if (updated) void _upsert(updated);
  },

  remove(id: string) {
    save(load().filter(d => d.id !== id));
    void _delete(id);
  },
};

// ── Supabase 双写同步 ─────────────────────────────────────────────────────────
let _uid: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

function _row(doc: CanvasDoc) {
  return {
    id: doc.id, user_id: _uid!, title: doc.title, content: doc.content,
    type: doc.type, scope: doc.scope, tags: doc.tags ?? [],
    created_at: doc.createdAt, updated_at: doc.updatedAt,
  };
}

async function _upsert(doc: CanvasDoc) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_canvas_docs').upsert(_row(doc));
}

async function _delete(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_canvas_docs').delete().eq('id', id).eq('user_id', _uid);
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('gsyen_canvas_docs')
    .select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  if (!data) return;
  const remote: CanvasDoc[] = data.map((r: any) => ({
    id: r.id, title: r.title, content: r.content,
    type: r.type as CanvasType, scope: r.scope as 'self' | 'shared',
    tags: r.tags ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
  }));
  const local     = load();
  const remIds    = new Set(remote.map(d => d.id));
  const localOnly = local.filter(d => !remIds.has(d.id));
  for (const doc of localOnly) await _upsert(doc);
  save([...remote, ...localOnly]);
}

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_canvas_docs:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_canvas_docs', filter: `user_id=eq.${uid}` },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});
