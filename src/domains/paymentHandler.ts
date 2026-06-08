import { ActionCard } from '../types/chat';
import {
  paymentStore,
  detectPaymentIntent,
  enrichMessageForPayment,
  PaymentOrder,
} from '../stores/paymentStore';
import { ledgerStore, Transaction } from '../stores/ledgerStore';
import { DomainHandler, DomainActionResult } from './types';
import { localDateStr } from '../utils/date';
import { Currency, detectCurrency, convertAmount, formatAmount, getCachedUsdToCnyRate, getUsdToCnyRate } from '../utils/exchangeRate';

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL_ZH: Record<string, string> = { pending: '待支付', paid: '已到账', failed: '已失败' };
const METHOD_LABEL_ZH: Record<string, string> = { wechat: '微信支付', alipay: '支付宝' };

function buildOrder(data: any): PaymentOrder {
  const todayStr = localDateStr(new Date());
  const currency: Currency = data.currency === 'USD' || data.currency === 'CNY'
    ? data.currency
    : detectCurrency(data.description || '');
  return {
    id:          `ai-${Date.now()}`,
    orderNo:     paymentStore.genOrderNo(),
    description: data.description || data.title || '收款',
    amount:      Number(data.amount) || 0,
    currency,
    method:      data.method === 'alipay' ? 'alipay' : 'wechat',
    status:      'pending',
    date:        todayStr,
    notes:       data.notes || '',
  };
}

function refreshRateInBackground(): void {
  void getUsdToCnyRate();
}

// meta[0] = 金额（focus 列大字，带币种符号，统一用 + 表示"待入账/已到账"金额）
// meta[1] = 状态 + 汇率换算参考值（"待支付 · ≈ $13.9" 这种）— 联动实时汇率
// meta[2] = 支付方式
// meta[3] = 订单号
function buildCard(action: ActionCard['action'], item: PaymentOrder, usdToCny: number): ActionCard {
  const other: Currency = item.currency === 'CNY' ? 'USD' : 'CNY';
  const converted = convertAmount(item.amount, item.currency, other, usdToCny);
  const statusLabel = STATUS_LABEL_ZH[item.status] ?? item.status;
  return {
    module: 'PAYMENT',
    action,
    title:  item.description,
    meta:   [
      `+${formatAmount(item.amount, item.currency)}`,
      `${statusLabel} · ≈ ${formatAmount(converted, other)}`,
      METHOD_LABEL_ZH[item.method] ?? item.method,
      item.orderNo,
    ],
  };
}

function commitOrder(item: PaymentOrder): void {
  paymentStore.add(item);
  window.dispatchEvent(new CustomEvent('payment-updated'));
}

/**
 * 演示阶段没有真实支付通道回调 —— 用一个短延迟模拟"用户扫码付款成功"，
 * 到账后自动写入 LEDGER（联动记账），呼应路线图"支付成功自动写入账簿"。
 * 真实接入时，这里会被替换成微信/支付宝的异步回调处理逻辑，
 * handler 对外暴露的接口（DomainActionResult/卡片渲染）完全不变。
 */
function simulateCallback(order: PaymentOrder, onSettled?: (settled: PaymentOrder) => void): void {
  setTimeout(() => {
    const settled: PaymentOrder = { ...order, status: 'paid' };
    paymentStore.update(order.id, { status: 'paid' });
    window.dispatchEvent(new CustomEvent('payment-updated'));

    const tx: Transaction = {
      id:          `pay-${order.id}`,
      description: `${order.description}（${order.orderNo} 收款到账）`,
      amount:      order.amount,
      currency:    order.currency,
      type:        'income',
      category:    'commission',
      date:        order.date,
      notes:       `联动 PAYMENT 自动入账 · ${METHOD_LABEL_ZH[order.method]}`,
    };
    ledgerStore.add(tx);
    window.dispatchEvent(new CustomEvent('ledger-updated'));

    onSettled?.(settled);
  }, 4000);
}

function parseFromAIResponse(fullText: string): PaymentOrder | null {
  const match = fullText.match(/```payment\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return buildOrder(JSON.parse(match[1].trim()));
  } catch {
    return null;
  }
}

// ─── handler ─────────────────────────────────────────────────────────────────

export const paymentHandler: DomainHandler = {
  module: 'PAYMENT',

  detectIntent(text) {
    return detectPaymentIntent(text);
  },

  enrichMessage(text, _intent, lang) {
    return enrichMessageForPayment(text, lang);
  },

  buildContext() {
    const recent = paymentStore.getRecent(5);
    if (recent.length === 0) return undefined;
    return recent.map(o => ({
      id:    o.id,
      title: `[${STATUS_LABEL_ZH[o.status]}] ${o.description} ${formatAmount(o.amount, o.currency)}`,
      date:  o.date,
      time:  '',
    }));
  },

  handleAction(action, ev, _lang): DomainActionResult | null {
    if (ev?.amount === undefined && !ev?.description) return null;
    if (action !== 'create') return null;

    const order = buildOrder(ev);
    commitOrder(order);
    simulateCallback(order);
    refreshRateInBackground();

    return {
      card:   buildCard('create', order, getCachedUsdToCnyRate()),
      notify: { action: 'create', title: order.description },
    };
  },

  resolveConfirmation(_pending, _lang): DomainActionResult | null {
    return null;
  },

  handleStreamResult(intent, fullText): DomainActionResult | null {
    if (intent !== 'add') return null;
    const order = parseFromAIResponse(fullText);
    if (!order) return null;
    commitOrder(order);
    simulateCallback(order);
    refreshRateInBackground();

    return {
      card:   buildCard('create', order, getCachedUsdToCnyRate()),
      notify: { action: 'create', title: order.description },
    };
  },
};
