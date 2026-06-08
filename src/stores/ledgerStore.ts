import { localDateStr } from '../utils/date';
import { Currency, detectCurrency } from '../utils/exchangeRate';
import { cardRegistry } from './cardRegistry';
import { CardRecord } from '../types/card';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  currency: Currency;          // 'CNY' | 'USD' — 记录原始币种，汇总时按实时汇率换算
  type: 'income' | 'expense';
  category: 'royalty' | 'commission' | 'material' | 'server' | 'marketing' | 'consultancy';
  date: string;
  notes?: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'identity_lab_finance';

/** 旧记录没有 currency 字段 — 一律按 CNY 兜底，向后兼容 */
function sanitize(raw: any[]): Transaction[] {
  return raw.map(item => ({ ...item, currency: item.currency === 'USD' ? 'USD' : 'CNY' }));
}

function readRaw(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeRaw(items: Transaction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// 卡片集信封主题色——延续「复式财务账簿」收入/支出的金色/米白对比语言，
// 而不是另起一套，"原地原色放大"才有依据。
const TYPE_ACCENT: Record<Transaction['type'], string> = {
  income:  '#C9A227', // 暖金 — 呼应账簿收入卡片的金色文字
  expense: '#6B6258', // 暖灰棕 — 呼应账簿支出卡片的米白/深咖啡基调
};

/** Transaction → 卡片集信封。payload 只存引用，不拷贝业务数据。 */
function toCardRecord(item: Transaction): CardRecord {
  return {
    id:         `ledger-${item.id}`,
    module:     'LEDGER',
    kind:       item.category,
    title:      item.description,
    color:      TYPE_ACCENT[item.type] ?? '#6B6258',
    timestamp:  item.date,
    status:     item.type,
    searchText: [item.description, item.category, item.notes, item.type].filter(Boolean).join(' '),
    payload:    item,
  };
}

let knownIds = new Set<string>();
function syncRegistry(items: Transaction[]): void {
  const nextIds = new Set(items.map(t => `ledger-${t.id}`));
  for (const item of items) cardRegistry.register(toCardRecord(item));
  for (const id of knownIds) if (!nextIds.has(id)) cardRegistry.unregister(id);
  knownIds = nextIds;
}

export const ledgerStore = {
  getAll(): Transaction[] { return readRaw(); },
  add(item: Transaction): void {
    const updated = [item, ...readRaw()];
    writeRaw(updated);
    // 登记点落在 store 层——chat 记一笔、未来账簿手动记一笔，都在这里
    // 被同一处逻辑收编进卡片集，不会出现"只有 chat 记的才进集合"。
    syncRegistry(updated);
  },
  remove(id: string): void {
    const updated = readRaw().filter(t => t.id !== id);
    writeRaw(updated);
    syncRegistry(updated);
  },
  getRecent(n = 5): Transaction[] { return readRaw().slice(0, n); },
};

// 启动即对账一次——把刷新前已经存在的记录也收编进卡片集。
syncRegistry(readRaw());

// ─── Intent detection ─────────────────────────────────────────────────────────
const EXPENSE_KEYWORDS = [
  '消费', '花了', '支出', '付款', '付了', '买了', '花费', '开销', '扣了', '扣款',
  '报销', '采购', '购买', '充值', '缴费', '订阅', '续费', '花掉', '支付',
  'spent', 'paid', 'expense', 'purchase', 'bought',
];

const INCOME_KEYWORDS = [
  '收入', '到账', '回款', '进账', '收到款', '打款', '入账',
  // 注：不放宽泛的"收款"二字 —— "生成收款码/帮我收款"是发起 PAYMENT 请求，
  // 和"已收到一笔款"的记账事件（"收到款/到账/回款"）语义不同，分流给 paymentHandler
  '佣金', '版税', '顾问费', '服务费', '合同款', '收了',
  'received', 'income', 'earned', 'payment received', 'revenue',
];

export type LedgerIntent = 'add' | null;

export function detectLedgerIntent(text: string): LedgerIntent {
  const lower = text.toLowerCase();
  if (EXPENSE_KEYWORDS.some(k => lower.includes(k))) return 'add';
  if (INCOME_KEYWORDS.some(k => lower.includes(k))) return 'add';
  // 金额 + 收支动词组合（"今天消费了100美金" 这类自然口语）
  // 数字 + 币种单位 → 视为潜在记账候选（不再强求动词，"给我500人民币备用金"
  // 这类没有"花/付/收/账"字样的自然口语也要能命中）。误触发的兜底交给后端
  // ledgerSystemSuffix —— 它会判断非记账场景并返回 action:"none"，不会生成卡片。
  if (/\d+/.test(text) && /(元|块|美元|美金|刀|人民币|rmb|usd|\$|¥)/i.test(text)) return 'add';
  return null;
}

/**
 * Enrich message for SSE models — append a ```ledger``` instruction so the
 * model knows to return a parseable block.
 */
export function enrichMessageForLedger(text: string, lang: 'zh' | 'en'): string {
  const today = localDateStr(new Date());
  const instruction = lang === 'zh'
    ? `\n\n[系统指令] 今天是 ${today}。请在回复末尾附上如下格式的账务数据，系统将自动写入账簿（仅需一个 \`\`\`ledger\`\`\` 块，currency 仅可为 CNY 或 USD，按用户原话的币种填写——"元/块/¥"→CNY，"美元/美金/刀/$"→USD）：\n\`\`\`ledger\n{"description":"描述","amount":100,"currency":"CNY","type":"expense","category":"material","date":"${today}","notes":""}\n\`\`\``
    : `\n\n[System] Today is ${today}. Please append one \`\`\`ledger\`\`\` block so the system can auto-create the ledger entry (currency must be "CNY" or "USD", matched to what the user said):\n\`\`\`ledger\n{"description":"Description","amount":100,"currency":"CNY","type":"expense","category":"material","date":"${today}","notes":""}\n\`\`\``;
  return text + instruction;
}
