import { ActionCard } from '../types/chat';
import {
  ledgerStore,
  detectLedgerIntent,
  enrichMessageForLedger,
  Transaction,
} from '../stores/ledgerStore';
import { DomainHandler, DomainActionResult } from './types';
import { localDateStr } from '../utils/date';

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTransactionItem(data: any): Transaction {
  const todayStr = localDateStr(new Date());
  return {
    id:          `ai-${Date.now()}`,
    description: data.description || data.title || '未命名记录',
    amount:      Number(data.amount) || 0,
    type:        data.type === 'income' ? 'income' : 'expense',
    category:    (['royalty', 'commission', 'material', 'server', 'marketing', 'consultancy'] as const)
                   .includes(data.category) ? data.category : 'material',
    date:        data.date || todayStr,
    notes:       data.notes || '',
  };
}

function buildCard(action: ActionCard['action'], item: Transaction): ActionCard {
  const sign = item.type === 'income' ? '+' : '-';
  // meta[0] = 金额（focus 列大字），meta[1] = 日期，meta[2] = category（右侧小标签）
  const amountStr = `${sign}${item.amount.toLocaleString()}`;
  return {
    module: 'LEDGER',
    action,
    title:  item.description,
    meta:   [amountStr, item.date, item.category].filter(Boolean),
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
      return {
        card:   buildCard('create', item),
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
    return {
      card:   buildCard('create', item),
      notify: { action: 'create', title: item.description },
    };
  },
};
