/** Per-session kanban store — columns + cards keyed by sessionId */
import { EventItem } from '../types/schedule';
import { DEFAULT_EVENTS } from '../config/scheduleConfig';
import { KanbanColumn } from './kanbanColumnStore';
import { supabase } from '../lib/supabase';
export type { KanbanColumn };

// ── Supabase 双写 ─────────────────────────────────────────────────────────────
let _uid: string | null = null;

async function _upsertCol(sid: string, col: KanbanColumn, pos: number) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_kanban_cols').upsert(
    { id: col.id, user_id: _uid, session_id: sid, title: col.title, position: pos }
  );
}
async function _upsertCard(sid: string, card: EventItem, pos: number) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_kanban_cards').upsert({
    id: card.id, user_id: _uid, session_id: sid, col_id: card.status ?? 'todo',
    title: card.title, subtitle: card.subtitle ?? '', date: card.date,
    end_date: card.endDate ?? null, status: card.status ?? 'todo',
    category: card.category, completed: card.completed, position: pos,
  });
}
async function _deleteCard(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_kanban_cards').delete().eq('id', id).eq('user_id', _uid);
}
async function _pull(userId: string) {
  if (!supabase) return;
  const [{ data: cols }, { data: cards }] = await Promise.all([
    supabase.from('gsyen_kanban_cols').select('*').eq('user_id', userId),
    supabase.from('gsyen_kanban_cards').select('*').eq('user_id', userId),
  ]);
  if (cols) {
    const bySid: Record<string, KanbanColumn[]> = {};
    cols.forEach((r: any) => { (bySid[r.session_id] ??= []).push({ id: r.id, title: r.title }); });
    Object.entries(bySid).forEach(([sid, cs]) => localStorage.setItem(colKey(sid), JSON.stringify(cs)));
  }
  if (cards) {
    const bySid: Record<string, EventItem[]> = {};
    cards.forEach((r: any) => {
      (bySid[r.session_id] ??= []).push({ id: r.id, title: r.title, subtitle: r.subtitle,
        date: r.date, endDate: r.end_date ?? undefined, status: r.status,
        category: r.category, completed: r.completed, time: '09:00' } as EventItem);
    });
    Object.entries(bySid).forEach(([sid, cs]) => localStorage.setItem(cardKey(sid), JSON.stringify(cs)));
    window.dispatchEvent(new CustomEvent('schedule-updated'));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_kanban:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gsyen_kanban_cols',  filter: `user_id=eq.${uid}` }, () => _pull(uid))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gsyen_kanban_cards', filter: `user_id=eq.${uid}` }, () => _pull(uid))
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});

const DEFAULT_COLS: KanbanColumn[] = [
  { id: 'todo',     title: '预约待编' },
  { id: 'progress', title: '执行中柜' },
  { id: 'review',   title: '评审阶段' },
  { id: 'done',     title: '极速已成' },
];

const colKey  = (sid: string) => `gsyen_kanban_cols_${sid}`;
const cardKey = (sid: string) => `gsyen_kanban_cards_${sid}`;

function loadCols(sid: string): KanbanColumn[] {
  try { const r = localStorage.getItem(colKey(sid)); if (r) return JSON.parse(r); } catch {}
  return DEFAULT_COLS.map(c => ({ ...c }));
}

function loadCards(sid: string): EventItem[] {
  try { const r = localStorage.getItem(cardKey(sid)); if (r) return JSON.parse(r); } catch {}
  return sid === 'default' ? DEFAULT_EVENTS : [];
}

function saveCols(sid: string, cols: KanbanColumn[]) {
  localStorage.setItem(colKey(sid), JSON.stringify(cols));
  cols.forEach((c, i) => _upsertCol(sid, c, i));
  window.dispatchEvent(new CustomEvent('kanban-columns-updated'));
}

function saveCards(sid: string, cards: EventItem[]) {
  localStorage.setItem(cardKey(sid), JSON.stringify(cards));
  cards.forEach((c, i) => _upsertCard(sid, c, i));
  window.dispatchEvent(new CustomEvent('schedule-updated'));
}

export const sessionKanbanStore = {
  getCols:  (sid: string) => loadCols(sid),
  getCards: (sid: string) => loadCards(sid),

  addCol: (sid: string, title: string) => {
    const cols = [...loadCols(sid), { id: `col_${Date.now()}`, title }];
    saveCols(sid, cols); return cols;
  },
  renameCol: (sid: string, id: string, title: string) => {
    const cols = loadCols(sid).map(c => c.id === id ? { ...c, title } : c);
    saveCols(sid, cols); return cols;
  },
  removeCol: (sid: string, id: string) => {
    const cols = loadCols(sid).filter(c => c.id !== id);
    saveCols(sid, cols); return cols;
  },
  reorderCols: (sid: string, fromId: string, toId: string) => {
    const cols = loadCols(sid);
    const fi = cols.findIndex(c => c.id === fromId);
    const ti = cols.findIndex(c => c.id === toId);
    if (fi < 0 || ti < 0 || fi === ti) return cols;
    const next = [...cols]; const [m] = next.splice(fi, 1); next.splice(ti, 0, m);
    saveCols(sid, next); return next;
  },

  addCard: (sid: string, card: EventItem) => {
    const cards = [...loadCards(sid), card];
    saveCards(sid, cards); return cards;
  },
  updateCard: (sid: string, id: string, changes: Partial<EventItem>) => {
    const cards = loadCards(sid).map(c => c.id === id ? { ...c, ...changes } : c);
    saveCards(sid, cards); return cards;
  },
  removeCard: (sid: string, id: string) => {
    const cards = loadCards(sid).filter(c => c.id !== id);
    saveCards(sid, cards);
    _deleteCard(id);
    return cards;
  },
  clearCards: (sid: string) => { saveCards(sid, []); return []; },
};
