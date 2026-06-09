/**
 * ActionCardView — 神机百炼 · 操作卡片渲染（折叠态卡片头 + 焦点计算）。
 * 展开/编辑面板见 CardExpandPanel；常量与两色配色见 cardConstants。
 * 深色基调，呼应用户气泡与 `>` 引用块的暗色细节语言。
 */
import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { MailExpandContent } from './MailExpandContent';
import { VaultExpandContent } from './VaultExpandContent';
import { OrderExpandContent } from './OrderExpandContent';
import { ActionCard } from '../types/chat';
import { Currency, detectSymbolCurrency } from '../utils/exchangeRate';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { EventItem } from '../types/schedule';
import { scheduleStore } from '../stores/scheduleStore';
import { ledgerStore, Transaction } from '../stores/ledgerStore';
import {
  ACTION_LABEL_ZH, ACTION_LABEL_EN, CARD_WIDTH, CARD_WIDTH_EXPANDED, CARD_WIDTH_COMPOSE, getCardColor,
} from './cardConstants';
import { CardExpandPanel } from './CardExpandPanel';

export function ActionCardView({ card, lang }: { card: ActionCard; lang: 'zh' | 'en' }) {
  const isDeleted = card.action === 'delete';
  const statusLabel = lang === 'zh'
    ? ACTION_LABEL_ZH[card.action] ?? ''
    : ACTION_LABEL_EN[card.action] ?? '';

  const meta = card.meta.filter(Boolean);
  const isLedger  = card.module === 'LEDGER';
  const isPayment = card.module === 'PAYMENT';

  // LEDGER:  meta[0]=金额, meta[1]=日期, meta[2]=category
  // PAYMENT: meta[0]=金额, meta[1]=状态, meta[2]=支付方式, meta[3]=订单号
  // CHRONOS: meta[0]="2026-06-08 · 15:00" → 转 12h 制作 focusText，日期作 focusSub
  let focusText = meta[0] ?? card.title;
  let focusSub  = meta[1] ?? '';
  let tags      = meta.slice(2);

  // 点击金额在 ¥ / $ 间切换显示——全局联动，详见 useDisplayCurrency。
  const originalCurrency: Currency = detectSymbolCurrency(meta[0] ?? '');
  const [displayCurrency, toggleDisplayCurrency] = useDisplayCurrency();
  const swapped = displayCurrency !== originalCurrency;
  const canSwapCurrency = (isLedger || isPayment) && /[¥$]/.test(meta[1] ?? '');
  const toggleSwap = toggleDisplayCurrency;

  if (isLedger) {
    const original     = meta[0] ?? '';                // "±100¥"
    const convertedRaw = meta[1] ?? '';                // "≈ 13.9$"
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
    const original = meta[0] ?? '';                    // "+100¥"
    const subRaw   = meta[1] ?? '';                    // "已到账 · ≈ 13.9$"
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
    // ORDER: meta[0]=service, meta[1]=plan, meta[2]=amount, meta[3]=status
    focusText = meta[0] ?? card.title;
    focusSub  = meta[1] ?? '';
    tags      = meta.slice(2);
  } else {
    const dtMatch = (meta[0] ?? '').match(/(\d{4}-)?(\d{2}-\d{2})\s*[·•]\s*(\d{1,2}):(\d{2})/);
    if (dtMatch) {
      const [, , md, hh, mm] = dtMatch;
      const h = parseInt(hh, 10);
      const h12 = ((h + 11) % 12) + 1;
      focusText = `${String(h12).padStart(2, '0')}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
      focusSub  = meta[1] ? `${md} · ${meta[1]}` : md;
      tags      = meta.slice(2);
    }
  }

  // scope：算法兜底判定 + 记录里持久化的 scope 永远优先（详见记忆 design-card-core）。
  const scopeGuess = /团队|客户|经理|对方|共享|协作|分成|开会|会议|对外/.test(card.title + meta.join(''))
    ? 'shared' : 'self';
  const persistedScope = !card.id ? undefined
    : isLedger
      ? ledgerStore.getAll().find(t => t.id === card.id)?.scope
      : scheduleStore.getAll().find(e => e.id === card.id)?.scope;
  const isMail    = card.module === 'MAIL';
  const isVault   = card.module === 'VAULT';
  const isChronos = card.module === 'CHRONOS';
  const isOrder   = card.module === 'ORDER';
  const canExpandChronos = isChronos && !!card.id && card.action !== 'query';
  const canExpandLedger  = isLedger  && !!card.id && card.action !== 'query';
  const canExpandVault   = isVault   && !!card.id;
  const canExpandOrder   = isOrder   && !!card.id;
  const canExpand = canExpandChronos || canExpandLedger || isMail || canExpandVault || canExpandOrder;
  const [expanded,      setExpanded]      = useState(false);
  const [mailComposing, setMailComposing] = useState(false);
  const [mailScope,     setMailScope]     = useState<'self' | 'shared'>('self');
  const [vaultScope,    setVaultScope]    = useState<'self' | 'shared'>('self');

  // ORDER 始终涉及客户，强制 shared（Regatta 蓝）
  const isShared = isOrder
    ? true
    : isMail
      ? mailScope === 'shared'
      : isVault
        ? vaultScope === 'shared'
        : (persistedScope ?? scopeGuess) === 'shared';
  const COLOR = getCardColor(isShared);

  const [event, setEvent] = useState<EventItem | null>(() =>
    canExpandChronos && card.id ? scheduleStore.getAll().find(e => e.id === card.id) ?? null : null
  );
  const [tx, setTx] = useState<Transaction | null>(() =>
    canExpandLedger && card.id ? ledgerStore.getAll().find(t => t.id === card.id) ?? null : null
  );

  // 与看板实时同步——拖拽/编辑时刷新本地 event/tx（卡片头与展开面板都读它）。
  useEffect(() => {
    if (canExpandChronos) {
      const sync = () => setEvent(scheduleStore.getAll().find(e => e.id === card.id) ?? null);
      window.addEventListener('schedule-updated', sync);
      return () => window.removeEventListener('schedule-updated', sync);
    }
    if (canExpandLedger) {
      const sync = () => setTx(ledgerStore.getAll().find(t => t.id === card.id) ?? null);
      window.addEventListener('ledger-updated', sync);
      return () => window.removeEventListener('ledger-updated', sync);
    }
  }, [canExpandChronos, canExpandLedger, card.id]);

  const stillExists = canExpandLedger ? !!tx : canExpandChronos ? !!event : true;

  return (
    <div className="mt-3 select-none">
      <div className={`rounded-xl border ${COLOR.border} ${COLOR.body} ${
        (mailComposing && CARD_WIDTH_COMPOSE[card.module])
          ? CARD_WIDTH_COMPOSE[card.module]
          : (canExpand && expanded && CARD_WIDTH_EXPANDED[card.module])
            ? CARD_WIDTH_EXPANDED[card.module]
            : (CARD_WIDTH[card.module] ?? 'w-[400px]')
      } max-w-full overflow-hidden transition-[width,box-shadow] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        canExpand && expanded
          ? 'shadow-[inset_0_1px_5px_rgba(0,0,0,0.07),_0_6px_20px_-4px_rgba(0,0,0,0.10)]'
          : ''
      }`}>
        <div
          onClick={() => { if (canExpand) setExpanded(o => !o); }}
          className={`flex h-[104px] transition-[filter] duration-200 ${(isMail || canExpand) ? 'cursor-pointer hover:brightness-105' : ''}`}
        >
          <div
            onClick={(e) => { if (canSwapCurrency) { e.stopPropagation(); toggleSwap(); } }}
            className={`flex flex-col items-center justify-center ${
              canExpand && expanded ? COLOR.body : COLOR.focus
            } shrink-0 overflow-hidden px-3 py-3 w-[148px] transition-colors duration-300 ${canSwapCurrency ? 'cursor-pointer hover:brightness-110 active:scale-[0.97] transition duration-200' : ''}`}
          >
            <span className={`font-extrabold leading-none tracking-tight truncate text-center w-full ${
              isLedger
                ? `text-[26px] font-serif font-bold ${focusText.startsWith('+') ? 'text-[#A6822E]' : 'text-[#8A6D1A]'}`
                : isPayment
                  ? `text-[20px] font-mono ${focusSub.startsWith('已到账') ? 'text-[#D4AF37]' : focusSub.startsWith('已失败') ? 'text-rose-500' : 'text-amber-500'}`
                  : isOrder
                    ? 'text-[22px] font-serif font-bold tracking-wide text-white/90'
                  : `text-[20px] font-mono ${isShared ? 'text-white/80' : 'text-[#1A1A1A]/70'}`
            }`}>
              {isLedger ? (() => {
                const m = focusText.match(/^([+-])([¥$])\s*(.+)$/);
                if (!m) return focusText;
                const [, sign, symbol, num] = m;
                return <>{sign}{num}<span className="ml-1 text-[0.55em] align-baseline opacity-80">{symbol}</span></>;
              })() : focusText}
            </span>
            {focusSub && <span className={`mt-1.5 tracking-wide truncate text-center w-full ${
              isOrder
                ? 'font-serif text-[10px] text-white/55 italic'
                : `font-mono text-[8px] ${COLOR.focusSub}`
            }`}>{focusSub}</span>}
          </div>
          <div className="flex-1 min-w-0 pl-6 pr-4 py-2.5 space-y-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-mono text-[8px] tracking-[0.18em] font-bold uppercase truncate ${
                isShared ? 'text-white/50' : 'text-[#1A1A1A]/50'
              }`}>{card.module}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`font-mono text-[8px] tracking-widest uppercase ${COLOR.label}`}>{statusLabel}</span>
                {canExpand && (
                  <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${expanded ? 'rotate-180' : ''} ${COLOR.label}`} />
                )}
              </div>
            </div>
            <p className={`font-sans font-semibold leading-snug truncate text-[13px] ${isDeleted ? COLOR.titleDel + ' line-through' : COLOR.title}`}>{event?.title ?? tx?.description ?? card.title}</p>
            {tags.length > 0 && (
              <div className="flex items-center gap-2 pt-0.5">
                {tags.map((tag, i) => (
                  <span key={i} className={`font-mono text-[9px] px-1.5 py-0.5 rounded-[1.5px] truncate ${COLOR.tag}`}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {canExpand && !isMail && !isVault && !isOrder && (
          <CardExpandPanel
            cardTitle={card.title}
            lang={lang}
            color={COLOR}
            canExpandLedger={canExpandLedger}
            expanded={expanded}
            event={event}
            tx={tx}
            stillExists={stillExists}
            scopeGuess={scopeGuess}
            onCollapse={() => setExpanded(false)}
          />
        )}

        {isVault && (
          <VaultExpandContent
            lang={lang}
            color={COLOR}
            credentialId={card.id}
            serviceName={focusText}
            expanded={expanded}
            scope={vaultScope}
            onScopeChange={setVaultScope}
            onCollapse={() => setExpanded(false)}
          />
        )}

        {isOrder && (
          <OrderExpandContent
            lang={lang}
            color={COLOR}
            orderId={card.id}
            expanded={expanded}
            onCollapse={() => setExpanded(false)}
          />
        )}

        {isMail && (
          <MailExpandContent
            lang={lang}
            color={COLOR}
            recipient={focusText}
            subject={card.title}
            expanded={expanded}
            scope={mailScope}
            onScopeChange={setMailScope}
            onCollapse={() => setExpanded(false)}
            onCompose={() => setMailComposing(true)}
            onComposeClose={() => setMailComposing(false)}
          />
        )}
      </div>
    </div>
  );
}
