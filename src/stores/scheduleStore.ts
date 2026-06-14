import { EventItem, ColumnId } from '../types/schedule';
import { cardRegistry } from './cardRegistry';
import { CardRecord } from '../types/card';
import { supabase } from '../lib/supabase';

// 卡片集信封的主题色——延续 categoryMap 的色相语言（看板上本来就用这套配色
// 标识分类),"原地原色放大"时复用同一套,不会出现"切到另一个东西"的割裂感。
const CATEGORY_ACCENT: Record<EventItem['category'], string> = {
  creative: '#10B981',
  finance:  '#F59E0B',
  secure:   '#6366F1',
  strategy: '#14B8A6',
};

/** EventItem → 卡片集信封。payload 只存引用，不拷贝业务数据。 */
function toCardRecord(event: EventItem): CardRecord {
  return {
    id:         `chronos-${event.id}`,
    module:     'CHRONOS',
    kind:       event.category,
    title:      event.title,
    subtitle:   event.subtitle,
    color:      CATEGORY_ACCENT[event.category] ?? '#4F77AC',
    timestamp:  `${event.date}T${event.time}`,
    status:     event.status,
    searchText: [event.title, event.subtitle, event.location, event.category].filter(Boolean).join(' '),
    payload:    event,
  };
}

/**
 * 把一份完整事件列表与卡片集对账——增/改的条目登记/刷新，消失的条目移除。
 * 之所以在这里做"对账"而不是逐条 register/unregister，是因为 mutate() 之后
 * 拿到的是结果列表，而不是哪条变了——对账最稳妥，不会漏登记/漏注销。
 */
let knownIds = new Set<string>();
function syncRegistry(events: EventItem[]): void {
  const nextIds = new Set(events.map(e => `chronos-${e.id}`));
  for (const event of events) cardRegistry.register(toCardRecord(event));
  for (const id of knownIds) if (!nextIds.has(id)) cardRegistry.unregister(id);
  knownIds = nextIds;
}

const STORAGE_KEY = 'identity_lab_schedule';

// ─── helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sortByDateTime(events: EventItem[]): EventItem[] {
  return [...events].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  );
}

function sanitize(raw: any[]): EventItem[] {
  return raw.map(item => ({
    ...item,
    status: (item.status || (item.completed ? 'done' : 'todo')) as ColumnId,
  }));
}

function readRaw(): EventItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    return sanitize(JSON.parse(saved));
  } catch {
    return [];
  }
}

/**
 * Atomic read-modify-write: re-reads from localStorage immediately before
 * applying `fn` and writing back, so each call sees the latest persisted
 * state instead of a possibly-stale snapshot held by the caller.
 */
function mutate(fn: (events: EventItem[]) => EventItem[]): EventItem[] {
  const updated = sortByDateTime(fn(readRaw()));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  // 登记点落在 store 层——无论这条记录是 chat 生成的，还是用户在看板上
  // 手动建/改/删的，都在这里被同一处逻辑收编进卡片集，不会出现
  // "只有 chat 生的卡片才进集合"的单向投递问题。
  syncRegistry(updated);
  return updated;
}

// ─── store ──────────────────────────────────────────────────────────────────

export const scheduleStore = {
  /** Read all events */
  getAll(): EventItem[] {
    return readRaw();
  },

  /** Persist all events (bulk replace — e.g. drag/drop reorder on the board) */
  save(events: EventItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    syncRegistry(events);
    events.forEach(e => _upsert(e));
  },

  /** Events that fall on today */
  getToday(): EventItem[] {
    const today = todayStr();
    return this.getAll().filter(e => {
      const end = e.endDate || e.date;
      return today >= e.date && today <= end;
    });
  },

  /** Add a new event (or replace an existing one with the same id), returns updated list */
  add(event: EventItem): EventItem[] {
    const result = mutate(events => {
      const exists = events.some(e => e.id === event.id);
      return exists ? events.map(e => (e.id === event.id ? event : e)) : [...events, event];
    });
    _upsert(event);
    return result;
  },

  /** Update fields on an existing event */
  update(id: string, changes: Partial<EventItem>): EventItem[] {
    const result = mutate(events =>
      events.map(e =>
        e.id === id ? { ...e, ...changes, completed: (changes.status ?? e.status) === 'done' } : e
      )
    );
    const updated = result.find(e => e.id === id);
    if (updated) _upsert(updated);
    return result;
  },

  /** Delete an event */
  remove(id: string): EventItem[] {
    const result = mutate(events => events.filter(e => e.id !== id));
    _delete(id);
    return result;
  },

  /** Wipe all events */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    syncRegistry([]);
  },

  // ─── Chat ↔ Calendar bridge ─────────────────────────────────────────────

  /**
   * Build a natural-language summary of today's events to inject as
   * context into an AI chat message.
   */
  buildTodayContext(lang: 'zh' | 'en'): string {
    const events = this.getToday();
    if (events.length === 0) {
      return lang === 'zh'
        ? '今天暂无日程安排。'
        : "No events scheduled for today.";
    }
    const header = lang === 'zh' ? '今天的日程安排：\n' : "Today's schedule:\n";
    const lines = events.map(e =>
      `- ${e.time}  ${e.title}${e.location ? `  @${e.location}` : ''}${e.subtitle ? `（${e.subtitle}）` : ''}`
    );
    return header + lines.join('\n');
  },

  /**
   * Parse a ```schedule ... ``` code block from an AI response.
   * Returns a ready-to-save EventItem, or null if no block found.
   */
  parseFromAIResponse(aiText: string): EventItem | null {
    const match = aiText.match(/```schedule\s*([\s\S]*?)```/);
    if (!match) return null;
    try {
      const data = JSON.parse(match[1].trim());
      if (!data.title) return null;
      const today = todayStr();
      return {
        id: `ai-${Date.now()}`,
        title: data.title,
        subtitle: data.subtitle || '',
        time: data.time || '09:00',
        date: data.date || today,
        endDate: data.endDate || data.date || today,
        category: data.category || 'strategy',
        location: data.location || '',
        completed: false,
        status: 'todo',
      };
    } catch {
      return null;
    }
  },
};

// 启动即对账一次——把刷新前已经存在的记录也收编进卡片集
syncRegistry(readRaw());

// ── Supabase 双写同步 ─────────────────────────────────────────────────────────
let _uid: string | null = null;

function _row(e: EventItem) {
  return { id: e.id, user_id: _uid!, title: e.title, subtitle: e.subtitle ?? '',
    date: e.date, end_date: e.endDate ?? null, time: e.time ?? null,
    status: e.status, category: e.category, completed: e.completed };
}

async function _upsert(e: EventItem) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_events').upsert(_row(e));
}

async function _delete(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_events').delete().eq('id', id).eq('user_id', _uid);
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('gsyen_events')
    .select('*').eq('user_id', userId);
  if (!data) return;
  const remote: EventItem[] = data.map((r: any) => ({
    id: r.id, title: r.title, subtitle: r.subtitle ?? '', date: r.date,
    endDate: r.end_date ?? undefined, time: r.time ?? '09:00',
    status: r.status as ColumnId, category: r.category,
    completed: r.completed, location: '',
  }));
  const local   = readRaw();
  const remIds  = new Set(remote.map(e => e.id));
  const localOnly = local.filter(e => !remIds.has(e.id));
  for (const e of localOnly) await _upsert(e);
  const merged = sortByDateTime([...remote, ...localOnly]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  syncRegistry(merged);
  window.dispatchEvent(new CustomEvent('schedule-updated'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_events:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_events', filter: `user_id=eq.${uid}` },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});
