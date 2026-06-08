import { ActionCard } from '../types/chat';
import {
  ledgerStore,
  detectLedgerIntent,
  enrichMessageForLedger,
  Transaction,
} from '../stores/ledgerStore';
import { DomainHandler, DomainActionResult } from './types';
import { localDateStr } from '../utils/date';
import { Currency, detectCurrency, convertAmount, formatAmount, getCachedUsdToCnyRate, getUsdToCnyRate } from '../utils/exchangeRate';

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTransactionItem(data: any, rawText?: string): Transaction {
  const todayStr = localDateStr(new Date());
  const currency: Currency = data.currency === 'USD' || data.currency === 'CNY'
    ? data.currency
    : detectCurrency(rawText || data.description || '');
  return {
    id:          `ai-${Date.now()}`,
    description: data.description || data.title || '未命名记录',
    amount:      Number(data.amount) || 0,
    currency,
    type:        data.type === 'income' ? 'income' : 'expense',
    category:    (['royalty', 'commission', 'material', 'server', 'marketing', 'consultancy'] as const)
                   .includes(data.category) ? data.category : 'material',
    date:        data.date || todayStr,
    notes:       data.notes || '',
  };
}

// meta[0] = 原始金额（focus 列大字，带币种符号）
// meta[1] = 汇率换算后的另一币种参考值（focus 列小字，"≈ $13.9" 这种）— 联动实时汇率
// meta[2] = 日期，meta[3] = category（右侧小标签）
function buildCard(action: ActionCard['action'], item: Transaction, usdToCny: number): ActionCard {
  const sign = item.type === 'income' ? '+' : '-';
  const amountStr = `${sign}${formatAmount(item.amount, item.currency)}`;
  const other: Currency = item.currency === 'CNY' ? 'USD' : 'CNY';
  const converted = convertAmount(item.amount, item.currency, other, usdToCny);
  const convertedStr = `≈ ${formatAmount(converted, other)}`;
  return {
    module: 'LEDGER',
    action,
    title:  item.description,
    meta:   [amountStr, convertedStr, item.date, item.category].filter(Boolean),
  };
}

function commit(item: Transaction): void {
  ledgerStore.add(item);
  window.dispatchEvent(new CustomEvent('ledger-updated'));
}

function parseFromAIResponse(fullText: string): Transaction | null {
  const match = fullText.match(/```ledger\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return buildTransactionItem(JSON.parse(match[1].trim()));
  } catch {
    return null;
  }
}

/**
 * 卡片渲染用同步的缓存汇率（即时返回，不阻塞 UI），同时在后台触发一次
 * 实时汇率刷新——下一笔记录就能用上最新值。两者都走同一个 6 小时缓存。
 */
function refreshRateInBackground(): void {
  void getUsdToCnyRate();
}

// ─── handler ─────────────────────────────────────────────────────────────────

export const ledgerHandler: DomainHandler = {
  module: 'LEDGER',

  detectIntent(text) {
    return detectLedgerIntent(text);
  },

  enrichMessage(text, _intent, lang) {
    return enrichMessageForLedger(text, lang);
  },

  buildContext() {
    // Return recent transactions as context — helps model understand existing records
    const recent = ledgerStore.getRecent(5);
    if (recent.length === 0) return undefined;
    // Re-use the same shape expected by sendToGateway context array
    return recent.map(t => ({
      id:    t.id,
      title: `[${t.type === 'income' ? '+' : '-'}${t.amount}] ${t.description}`,
      date:  t.date,
      time:  '',
    }));
  },

  handleAction(action, ev, _lang): DomainActionResult | null {
    // Only handle if ev has ledger-specific fields (distinguishes from CHRONOS)
    if (ev?.amount === undefined && !ev?.description) return null;

    if (action === 'create') {
      const item = buildTransactionItem(ev);
      commit(item);
      refreshRateInBackground();
      return {
        card:   buildCard('create', item, getCachedUsdToCnyRate()),
        notify: { action: 'create', title: item.description },
      };
    }
    return null;
  },

  resolveConfirmation(_pending, _lang): DomainActionResult | null {
    return null;
  },

  handleStreamResult(intent, fullText): DomainActionResult | null {
    if (intent !== 'add') return null;
    const item = parseFromAIResponse(fullText);
    if (!item) return null;
    commit(item);
    refreshRateInBackground();
    return {
      card:   buildCard('create', item, getCachedUsdToCnyRate()),
      notify: { action: 'create', title: item.description },
    };
  },
};
