import { EventItem, ColumnId } from '../types/schedule';

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
  return updated;
}

// ─── store ──────────────────────────────────────────────────────────────────

export const scheduleStore = {
  /** Read all events */
  getAll(): EventItem[] {
    return readRaw();
  },

  /** Persist all events */
  save(events: EventItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
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
    return mutate(events => {
      const exists = events.some(e => e.id === event.id);
      return exists ? events.map(e => (e.id === event.id ? event : e)) : [...events, event];
    });
  },

  /** Update fields on an existing event */
  update(id: string, changes: Partial<EventItem>): EventItem[] {
    return mutate(events =>
      events.map(e =>
        e.id === id ? { ...e, ...changes, completed: (changes.status ?? e.status) === 'done' } : e
      )
    );
  },

  /** Delete an event */
  remove(id: string): EventItem[] {
    return mutate(events => events.filter(e => e.id !== id));
  },

  /** Wipe all events */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
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

// ─── Intent detection ────────────────────────────────────────────────────────

const QUERY_KEYWORDS = [
  '今天计划', '今天日程', '今天安排', '工作计划', '工作安排',
  "today's schedule", "today plan", "what's scheduled",
];
const ADD_KEYWORDS = [
  // 明确添加意图
  '添加日程', '加入日历', '新建日程', '帮我记录', '帮我安排',
  '安排一个', '加一个', '记一下', '记录一下', '新增', '建一个',
  // 今天要做 / 工作计划
  '今天要做', '今天我要', '今天打算', '今天需要', '今天准备',
  '安排今天', '今天工作', '今天任务',
  // 被动陈述句 — "下午有个会" "明天有一个发布会" 等
  '今天有', '今天下午有', '今天上午有', '今天晚上有',
  '明天有', '明天下午有', '明天上午有',
  '下午有', '上午有', '晚上有', '早上有',
  '有个会', '有一个会', '有个活动', '有一个活动',
  '有个发布', '有一个发布', '有个产品', '有一个产品',
  '要参加', '要去', '要看一个', '要开会',
  // English
  'add schedule', 'add event', 'create event', 'schedule a', 'remind me',
  'put it on', 'block time', 'plan to',
  'have a meeting', 'have a call', 'have an event',
];

// "时间表达式 + 事项动词"组合 — 覆盖"明天上午9点开会"这类口语化建日程语序，
// 弥补 ADD_KEYWORDS 固定搭配（有/要/添加…）覆盖不到自然时间状语的问题。
const TIME_EXPR = /(今天|明天|后天|大后天|下周|这周|本周|周[一二三四五六日天]|星期[一二三四五六日天]|[0-9]{1,2}[点:：][0-9]{0,2}|上午|下午|晚上|早上|早晨|中午|傍晚|凌晨)/;
const ACTIVITY_VERB = /(开会|会议|评审|评审会|面试|约见|见面|聚餐|出差|上课|讲座|汇报|培训|拜访|签约|面谈|发布会|演讲|答辩|体检|看病|聚会|约会|碰头|讨论|对接|复盘|路演|提交|截止|交付|发车|起飞|出发|集合)/;

export type ScheduleIntent = 'query' | 'add' | null;

export function detectScheduleIntent(text: string): ScheduleIntent {
  const lower = text.toLowerCase();
  if (QUERY_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return 'query';
  if (ADD_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return 'add';
  if (TIME_EXPR.test(text) && ACTIVITY_VERB.test(text)) return 'add';
  return null;
}

/**
 * Enrich a user message before sending to AI.
 * - 'query': prepend today's event list as context
 * - 'add': append instruction for AI to return a ```schedule``` block
 */
export function enrichMessageForSchedule(
  text: string,
  intent: ScheduleIntent,
  lang: 'zh' | 'en'
): string {
  if (intent === 'query') {
    const ctx = scheduleStore.buildTodayContext(lang);
    return lang === 'zh'
      ? `[日程上下文]\n${ctx}\n\n[用户问题]\n${text}`
      : `[Schedule Context]\n${ctx}\n\n[User Question]\n${text}`;
  }
  if (intent === 'add') {
    const today = todayStr();
    const instruction = lang === 'zh'
      ? `\n\n[系统指令] 今天是 ${today}。请在回复末尾附上如下格式的日程数据，系统将自动写入日历（仅需一个 \`\`\`schedule\`\`\` 块，日期若未指定请默认今天）：\n\`\`\`schedule\n{"title":"事件名称","date":"${today}","time":"09:00","category":"creative","location":"","subtitle":"简短说明"}\n\`\`\``
      : `\n\n[System] Today is ${today}. Please append one \`\`\`schedule\`\`\` block at the end of your reply so the system can auto-create the calendar event (use today's date if not specified):\n\`\`\`schedule\n{"title":"Event title","date":"${today}","time":"09:00","category":"creative","location":"","subtitle":"Brief note"}\n\`\`\``;
    return text + instruction;
  }
  return text;
}
