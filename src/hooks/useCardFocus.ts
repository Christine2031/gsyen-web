/**
 * useCardFocus — 各模块卡片左侧焦点列与右侧标签的计算逻辑。
 * 从 ActionCardView 拆出，保持单文件 ≤300 行规范。
 */
import { ActionCard } from '../types/chat';
import { Currency, detectSymbolCurrency } from '../utils/exchangeRate';

export interface CardFocus {
  focusText:        string;
  focusSub:         string;
  tags:             string[];
  originalCurrency: Currency;
  canSwapCurrency:  boolean;
}

export function useCardFocus(card: ActionCard, swapped: boolean): CardFocus {
  const meta     = card.meta.filter(Boolean);
  const isLedger  = card.module === 'LEDGER';
  const isPayment = card.module === 'PAYMENT';

  let focusText = meta[0] ?? card.title;
  let focusSub  = meta[1] ?? '';
  let tags      = meta.slice(2);

  const originalCurrency: Currency = detectSymbolCurrency(meta[0] ?? '');
  const canSwapCurrency = (isLedger || isPayment) && /[¥$]/.test(meta[1] ?? '');

  if (isLedger) {
    const original     = meta[0] ?? '';
    const convertedRaw = meta[1] ?? '';
    if (swapped && convertedRaw) {
      const sign         = original.match(/^[+-]/)?.[0] ?? '';
      const originalNum  = original.replace(/^[+-]/, '');
      const convertedNum = convertedRaw.replace(/^≈\s*/, '');
      focusText = `${sign}${convertedNum}`;
      tags      = [`≈ ${originalNum}`, ...meta.slice(2)];
    } else {
      focusText = original;
      tags      = meta.slice(1);
    }
    focusSub = '';

  } else if (isPayment) {
    const original = meta[0] ?? '';
    const subRaw   = meta[1] ?? '';
    const subMatch = subRaw.match(/^(.*?)(?:\s*·\s*≈\s*(.+))?$/);
    const statusTxt    = subMatch?.[1] ?? subRaw;
    const convertedNum = subMatch?.[2] ?? '';
    if (swapped && convertedNum) {
      const sign        = original.match(/^[+-]/)?.[0] ?? '';
      const originalNum = original.replace(/^[+-]/, '');
      focusText = `${sign}${convertedNum}`;
      focusSub  = `${statusTxt} · ≈ ${originalNum}`;
    } else {
      focusText = original;
      focusSub  = subRaw;
    }
    tags = meta.slice(2);

  } else if (card.module === 'ORDER') {
    focusText = meta[0] ?? card.title;
    focusSub  = meta[1] ?? '';
    tags      = meta.slice(2);

  } else {
    // CHRONOS：把 datetime 字符串转成 12h 制时间
    const dtMatch = (meta[0] ?? '').match(/(\d{4}-)?(\d{2}-\d{2})\s*[·•]\s*(\d{1,2}):(\d{2})/);
    if (dtMatch) {
      const [, , md, hh, mm] = dtMatch;
      const h   = parseInt(hh, 10);
      const h12 = ((h + 11) % 12) + 1;
      focusText = `${String(h12).padStart(2, '0')}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
      focusSub  = meta[1] ? `${md} · ${meta[1]}` : md;
      tags      = meta.slice(2);
    }
  }

  return { focusText, focusSub, tags, originalCurrency, canSwapCurrency };
}
