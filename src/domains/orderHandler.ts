/**
 * orderHandler — 订单卡片 domain handler
 *
 * 触发语："买/购买/开通/订阅 + 会员/套餐/月/年 + 服务名"
 * eagerCard 模式：intent 命中立即生成 pending 订单卡片 + 写入 orderStore。
 */
import { ActionCard } from '../types/chat';
import { orderStore, Order, OrderStatus } from '../stores/orderStore';
import { DomainHandler, DomainActionResult } from './types';
import { localDateStr } from '../utils/date';

// ─── Intent ───────────────────────────────────────────────────────────────────

const TRIGGER_VERBS = ['买', '购买', '开通', '订阅', '续费', '帮我开', '帮开', '购', '下单'];
const TRIGGER_NOUNS = ['会员', '套餐', '服务', '月', '年', '季', '订单'];

export function detectOrderIntent(text: string): string | null {
  const hasVerb = TRIGGER_VERBS.some(k => text.includes(k))
    || /帮\s*\S{1,8}\s*开/.test(text);  // "帮 yuki 开" / "帮小明开" 等代客操作
  const hasNoun = TRIGGER_NOUNS.some(k => text.includes(k));
  if (hasVerb && hasNoun) return 'create';
  return null;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

const SERVICE_MAP: [RegExp, string][] = [
  [/疆域|GSYEN/i,   '疆域'],
  [/三元楼/,        '三元楼'],
  [/老陈/,          '老陈预测'],
  [/PRISM/i,        'PRISM'],
  [/穹弯|雍彻/,     '穹弯'],
];

const PLAN_MAP: [RegExp, string][] = [
  [/年会员|年套餐|按年|一年/,   '年会员'],
  [/季度|季/,                   '季度套餐'],
  [/月会员|月套餐|按月|一个月/, '月会员'],
  [/体验|试用/,                 '体验套餐'],
];

function extractService(text: string): string {
  for (const [re, name] of SERVICE_MAP) if (re.test(text)) return name;
  return '疆域';  // 默认
}

function extractPlan(text: string): string {
  for (const [re, label] of PLAN_MAP) if (re.test(text)) return label;
  return '月会员'; // 默认
}

function extractAmount(text: string): { amount: number; currency: 'CNY' | 'USD' } {
  const usd = text.match(/(\d+(?:\.\d+)?)\s*(?:美元|美金|刀|\$)/i);
  if (usd) return { amount: parseFloat(usd[1]), currency: 'USD' };
  const cny = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块|¥|人民币)/);
  if (cny) return { amount: parseFloat(cny[1]), currency: 'CNY' };
  return { amount: 0, currency: 'CNY' };
}

function extractCustomer(text: string): string {
  // 匹配"帮 XXX 开"/"给 XXX"等模式，提取2-4字人名
  // 排除"我"——"帮我开"是自己操作，客户待确认
  const m = text.match(/(?:帮|给|为)\s*([^\s买购开通订阅]{1,4})\s*(?:开|买|购|订)/);
  if (m && m[1] !== '我') return m[1];
  return '待确认';
}

// ─── Card builder ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待付款', partial: '部分付款', active: '已生效', expired: '已到期',
};

function buildCard(action: ActionCard['action'], order: Order): ActionCard {
  const symbol = order.currency === 'USD' ? '$' : '¥';
  // 左侧：服务名（大字）+ 套餐·金额（小字）
  // 右侧：订单状态（主标题）+ 会员名（tag）
  const amountStr = `${symbol}${order.amount > 0 ? order.amount : 0}`;
  return {
    module: 'ORDER',
    action,
    title:  `${STATUS_LABEL[order.status]}  ${amountStr}`,  // 右侧主标题：待付款  ¥199
    meta:   [
      order.service,                               // focusText（左大字：疆域）
      order.plan,                                  // focusSub（左小字：月会员）
      ...(order.customer && order.customer !== '待确认' ? [order.customer] : []), // tag：客户名
    ],
    id: order.id,
  };
}

function makeOrder(text: string): Order {
  const { amount } = extractAmount(text);
  const today = localDateStr(new Date());
  return {
    id:         `order-${Date.now()}`,
    service:    extractService(text),
    plan:       extractPlan(text),
    customer:   extractCustomer(text),
    amount,
    currency:   'CNY',   // 疆域服务只收人民币
    paidAmount: 0,
    status:     'pending',
    startDate:  today,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const orderHandler: DomainHandler = {
  module: 'ORDER',
  dominates: ['LEDGER'],  // 有订单必记账：ORDER 是主，LEDGER 是影子，影子不出卡

  detectIntent(text) { return detectOrderIntent(text); },

  enrichMessage(text, _intent, lang) {
    const today = localDateStr(new Date());
    const order = makeOrder(text);
    const missingCustomer = order.customer === '待确认';
    const missingAmount   = order.amount === 0;

    let ask = '';
    if (missingCustomer && missingAmount) {
      ask = lang === 'zh'
        ? '请问这是为哪位客户开通？费用是多少？'
        : 'Who is this order for, and what is the amount?';
    } else if (missingCustomer) {
      ask = lang === 'zh' ? '请问这是为哪位客户开通？' : 'Who is this order for?';
    } else if (missingAmount) {
      ask = lang === 'zh' ? '请问这笔订单的费用是多少？' : 'What is the amount for this order?';
    }

    const suffix = lang === 'zh'
      ? `\n\n[系统] 今天是 ${today}。用户在创建订单。${ask ? '信息不完整，请回复：' + ask : '信息完整，请确认订单并回复。'}无需生成 JSON。`
      : `\n\n[System] Today is ${today}. User is creating an order. ${ask ? 'Missing info — ask: ' + ask : 'Info complete, confirm the order.'} No JSON needed.`;
    return text + suffix;
  },

  buildContext() {
    const recent = orderStore.getRecent(3);
    if (!recent.length) return undefined;
    return recent.map(o => ({
      id:    o.id,
      title: `[${o.status}] ${o.customer} · ${o.service}${o.plan}`,
      date:  o.startDate,
      time:  '',
    }));
  },

  // eagerCard：客户名 + 金额都齐全才建卡，缺一不可
  eagerCard(text, _lang): ActionCard | null {
    const order = makeOrder(text);
    const hasCustomer = order.customer !== '待确认';
    const hasAmount   = order.amount > 0;
    if (!hasCustomer || !hasAmount) return null;  // 信息不完整，让 AI 去问
    orderStore.add(order);
    return buildCard('create', order);
  },

  handleAction(action, ev, _lang): DomainActionResult | null {
    if (!ev?.service && !ev?.customer) return null;
    if (action !== 'create') return null;
    const today = localDateStr(new Date());
    const order: Order = {
      id:         `order-${Date.now()}`,
      service:    ev.service   ?? '疆域',
      plan:       ev.plan      ?? '月会员',
      customer:   ev.customer  ?? '待确认',
      amount:     Number(ev.amount)    || 0,
      currency:   ev.currency  === 'USD' ? 'USD' : 'CNY',
      paidAmount: Number(ev.paidAmount) || 0,
      status:     (['pending','partial','active','expired'] as OrderStatus[]).includes(ev.status)
                    ? ev.status : 'pending',
      startDate:  ev.startDate ?? today,
      expireDate: ev.expireDate,
      notes:      ev.notes,
    };
    orderStore.add(order);
    return { card: buildCard('create', order), notify: { action: 'create', title: `${order.customer} · ${order.service}` } };
  },

  resolveConfirmation: () => null,

  handleStreamResult: () => null,
};
