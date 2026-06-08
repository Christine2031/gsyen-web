import { localDateStr } from '../utils/date';
import { Currency } from '../utils/exchangeRate';

// ─── Types ────────────────────────────────────────────────────────────────────
// 演示阶段：本地模拟收款单据，不接入真实微信/支付宝通道。
// 字段已按真实通道的回调形态设计（orderNo/status/method），后续接入时
// 只需把 commit() 换成真实回调写入，handler/卡片渲染均无需改动。
export type PaymentMethod = 'wechat' | 'alipay';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface PaymentOrder {
  id:          string;
  orderNo:     string;
  description: string;
  amount:      number;
  currency:    Currency;       // 'CNY' | 'USD' — 收款币种，卡片同时显示按实时汇率换算的另一币种参考值
  method:      PaymentMethod;
  status:      PaymentStatus;
  date:        string;
  notes?:      string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'identity_lab_payments';

/** 旧记录没有 currency 字段 — 一律按 CNY 兜底，向后兼容 */
function sanitize(raw: any[]): PaymentOrder[] {
  return raw.map(item => ({ ...item, currency: item.currency === 'USD' ? 'USD' : 'CNY' }));
}

function readRaw(): PaymentOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeRaw(items: PaymentOrder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function genOrderNo(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `GS${stamp}${Math.floor(Math.random() * 9000 + 1000)}`;
}

export const paymentStore = {
  getAll(): PaymentOrder[] { return readRaw(); },
  add(item: PaymentOrder): void { writeRaw([item, ...readRaw()]); },
  /** Update fields on an existing order by id (e.g. pending → paid on callback) */
  update(id: string, changes: Partial<PaymentOrder>): void {
    writeRaw(readRaw().map(o => (o.id === id ? { ...o, ...changes } : o)));
  },
  remove(id: string): void { writeRaw(readRaw().filter(o => o.id !== id)); },
  getRecent(n = 5): PaymentOrder[] { return readRaw().slice(0, n); },
  genOrderNo,
};

// ─── Intent detection ─────────────────────────────────────────────────────────
const PAYMENT_KEYWORDS = [
  '收款码', '收款二维码', '生成收款', '生成付款', '扫码支付', '扫码收款',
  '微信收款', '支付宝收款', '微信支付', '支付宝支付', '付款链接', '收款链接',
  '发起收款', '发起付款', '请款', '催款', '账单', '生成账单',
  'payment link', 'collect payment', 'request payment', 'invoice',
];

export type PaymentIntent = 'add' | null;

export function detectPaymentIntent(text: string): PaymentIntent {
  const lower = text.toLowerCase();
  if (PAYMENT_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return 'add';
  // 金额 + 收/付款动词组合（"帮我向客户收 500 元" 这类自然口语，且要带"收款/付款"语义动词，
  // 避免和 LEDGER 的"花了/到账"记账场景重叠 — 二者语义不同：LEDGER 是事后记录，
  // PAYMENT 是发起一笔待支付的请求/凭证）
  if (/\d+/.test(text) && /(元|块|美元|美金|刀|人民币|rmb|usd|\$|¥)/i.test(text)) {
    if (/(收款|付款|请款|开个码|生成.*码|二维码)/.test(text)) return 'add';
  }
  return null;
}

/**
 * Enrich message for SSE models — append a ```payment``` instruction so the
 * model knows to return a parseable block.
 */
export function enrichMessageForPayment(text: string, lang: 'zh' | 'en'): string {
  const today = localDateStr(new Date());
  const instruction = lang === 'zh'
    ? `\n\n[系统指令] 今天是 ${today}。请在回复末尾附上如下格式的收款数据，系统将自动生成收款凭证（仅需一个 \`\`\`payment\`\`\` 块，method 仅可为 wechat 或 alipay，currency 仅可为 CNY 或 USD，按用户原话的币种填写——"元/块/¥"→CNY，"美元/美金/刀/$"→USD）：\n\`\`\`payment\n{"description":"用途说明","amount":100,"currency":"CNY","method":"wechat","notes":""}\n\`\`\``
    : `\n\n[System] Today is ${today}. Please append one \`\`\`payment\`\`\` block so the system can generate a payment voucher (method must be "wechat" or "alipay", currency must be "CNY" or "USD"):\n\`\`\`payment\n{"description":"What it's for","amount":100,"currency":"CNY","method":"wechat","notes":""}\n\`\`\``;
  return text + instruction;
}
