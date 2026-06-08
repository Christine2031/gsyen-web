import { localDateStr } from '../utils/date';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: 'royalty' | 'commission' | 'material' | 'server' | 'marketing' | 'consultancy';
  date: string;
  notes?: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'identity_lab_finance';

function readRaw(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRaw(items: Transaction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const ledgerStore = {
  getAll(): Transaction[] { return readRaw(); },
  add(item: Transaction): void { writeRaw([item, ...readRaw()]); },
  remove(id: string): void { writeRaw(readRaw().filter(t => t.id !== id)); },
  getRecent(n = 5): Transaction[] { return readRaw().slice(0, n); },
};

// ─── Intent detection ─────────────────────────────────────────────────────────
const EXPENSE_KEYWORDS = [
  '消费', '花了', '支出', '付款', '付了', '买了', '花费', '开销', '扣了', '扣款',
  '报销', '采购', '购买', '充值', '缴费', '订阅', '续费', '花掉', '支付',
  'spent', 'paid', 'expense', 'purchase', 'bought',
];

const INCOME_KEYWORDS = [
  '收入', '到账', '回款', '进账', '收款', '收到款', '打款', '入账',
  '佣金', '版税', '顾问费', '服务费', '合同款', '收了',
  'received', 'income', 'earned', 'payment received', 'revenue',
];

export type LedgerIntent = 'add' | null;

export function detectLedgerIntent(text: string): LedgerIntent {
  const lower = text.toLowerCase();
  if (EXPENSE_KEYWORDS.some(k => lower.includes(k))) return 'add';
  if (INCOME_KEYWORDS.some(k => lower.includes(k))) return 'add';
  // 金额 + 收支动词组合（"今天消费了100美金" 这类自然口语）
  if (/\d+/.test(text) && /(元|块|美元|美金|刀|rmb|usd|\$|¥)/i.test(text)) {
    if (/(花|付|买|消|支|扣|报|收|账)/.test(text)) return 'add';
  }
  return null;
}

/**
 * Enrich message for SSE models — append a ```ledger``` instruction so the
 * model knows to return a parseable block.
 */
export function enrichMessageForLedger(text: string, lang: 'zh' | 'en'): string {
  const today = localDateStr(new Date());
  const instruction = lang === 'zh'
    ? `\n\n[系统指令] 今天是 ${today}。请在回复末尾附上如下格式的账务数据，系统将自动写入账簿（仅需一个 \`\`\`ledger\`\`\` 块）：\n\`\`\`ledger\n{"description":"描述","amount":100,"type":"expense","category":"material","date":"${today}","notes":""}\n\`\`\``
    : `\n\n[System] Today is ${today}. Please append one \`\`\`ledger\`\`\` block so the system can auto-create the ledger entry:\n\`\`\`ledger\n{"description":"Description","amount":100,"type":"expense","category":"material","date":"${today}","notes":""}\n\`\`\``;
  return text + instruction;
}
