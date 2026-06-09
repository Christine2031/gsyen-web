/**
 * ActionCardView — 神机百炼 · 操作卡片渲染（折叠态卡片头 + 展开面板路由）。
 * 焦点计算见 useCardFocus；常量与两色配色见 cardConstants。
 */
import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { MailExpandContent } from './MailExpandContent';
import { VaultExpandContent } from './VaultExpandContent';
import { OrderExpandContent } from './OrderExpandContent';
import { CanvasExpandContent } from './CanvasExpandContent';
import { CanvasEditorContent } from './CanvasEditorContent';
import { ActionCard } from '../types/chat';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { useCardFocus } from '../hooks/useCardFocus';
import { EventItem } from '../types/schedule';
import { scheduleStore } from '../stores/scheduleStore';
import { ledgerStore, Transaction } from '../stores/ledgerStore';
import {
  ACTION_LABEL_ZH, ACTION_LABEL_EN, CARD_WIDTH, CARD_WIDTH_EXPANDED, CARD_WIDTH_COMPOSE, getCardColor,
} from './cardConstants';
import { CardExpandPanel } from './CardExpandPanel';

export function ActionCardView({ card, lang }: { card: ActionCard; lang: 'zh' | 'en' }) {
  const isDeleted   = card.action === 'delete';
  const statusLabel = lang === 'zh' ? ACTION_LABEL_ZH[card.action] ?? '' : ACTION_LABEL_EN[card.action] ?? '';
  const isLedger  = card.module === 'LEDGER';
  const isPayment = card.module === 'PAYMENT';
  const isMail    = card.module === 'MAIL';
  const isVault   = card.module === 'VAULT';
  const isChronos = card.module === 'CHRONOS';
  const isOrder   = card.module === 'ORDER';
  const isCanvas  = card.module === 'CANVAS';

  const [displayCurrency, toggleDisplayCurrency] = useDisplayCurrency();
  const originalCurrencyGuess = card.meta[0] ? card.meta[0] : '';
  const swapped = displayCurrency !== (originalCurrencyGuess.includes('$') ? 'USD' : 'CNY');

  const { focusText, focusSub, tags, canSwapCurrency } = useCardFocus(card, swapped);

  // scope 判定：各模块独立 scope state，持久化优先
  const scopeGuess = /团队|客户|经理|对方|共享|协作|分成|开会|会议|对外/.test(card.title + card.meta.join(''))
    ? 'shared' : 'self';
  const persistedScope = !card.id ? undefined
    : isLedger  ? ledgerStore.getAll().find(t => t.id === card.id)?.scope
    : scheduleStore.getAll().find(e => e.id === card.id)?.scope;

  const canExpandChronos = isChronos && !!card.id && card.action !== 'query';
  const canExpandLedger  = isLedger  && !!card.id && card.action !== 'query';
  const canExpandVault   = isVault   && !!card.id;
  const canExpandOrder   = isOrder   && !!card.id;
  const canExpandCanvas  = isCanvas  && !!card.id;
  const canExpand = canExpandChronos || canExpandLedger || isMail || canExpandVault || canExpandOrder || canExpandCanvas;

  const [expanded,      setExpanded]      = useState(false);
  const [mailComposing, setMailComposing] = useState(false);
  const [mailScope,     setMailScope]     = useState<'self' | 'shared'>('self');
  const [vaultScope,    setVaultScope]    = useState<'self' | 'shared'>('self');
  const [orderScope,    setOrderScope]    = useState<'self' | 'shared'>('self');
  const [canvasScope,   setCanvasScope]   = useState<'self' | 'shared'>('self');
  const [canvasEditing, setCanvasEditing] = useState(false);

  const isShared = isCanvas ? canvasScope === 'shared'
    : isOrder  ? orderScope  === 'shared'
    : isMail   ? mailScope   === 'shared'
    : isVault  ? vaultScope  === 'shared'
    : (persistedScope ?? scopeGuess) === 'shared';
  const COLOR = getCardColor(isShared);

  const [event, setEvent] = useState<EventItem | null>(() =>
    canExpandChronos && card.id ? scheduleStore.getAll().find(e => e.id === card.id) ?? null : null
  );
  const [tx, setTx] = useState<Transaction | null>(() =>
    canExpandLedger && card.id ? ledgerStore.getAll().find(t => t.id === card.id) ?? null : null
  );

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

  const cardWidth = (mailComposing && CARD_WIDTH_COMPOSE[card.module])
    ? CARD_WIDTH_COMPOSE[card.module]
    : (canExpand && expanded && CARD_WIDTH_EXPANDED[card.module])
      ? CARD_WIDTH_EXPANDED[card.module]
      : (CARD_WIDTH[card.module] ?? 'w-[400px]');

  return (
    <div className="mt-3 select-none">
      <div className={`rounded-xl border ${COLOR.border} ${COLOR.body} ${cardWidth} max-w-full overflow-hidden transition-[width,box-shadow] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        canExpand && expanded ? 'shadow-[inset_0_1px_5px_rgba(0,0,0,0.07),_0_6px_20px_-4px_rgba(0,0,0,0.10)]' : ''
      }`}>
        {/* L1 卡片头 */}
        <div onClick={() => { if (canExpand) setExpanded(o => !o); }}
          className={`flex h-[104px] transition-[filter] duration-200 ${(isMail || canExpand) ? 'cursor-pointer hover:brightness-105' : ''}`}>
          {/* 左侧焦点列 */}
          <div
            onClick={(e) => { if (canSwapCurrency) { e.stopPropagation(); toggleDisplayCurrency(); } }}
            className={`flex flex-col items-center justify-center ${canExpand && expanded ? COLOR.body : COLOR.focus} shrink-0 overflow-hidden px-3 py-3 w-[148px] transition-colors duration-300 ${canSwapCurrency ? 'cursor-pointer hover:brightness-110 active:scale-[0.97] transition duration-200' : ''}`}
          >
            <span className={`font-extrabold leading-none tracking-tight truncate text-center w-full ${
              isLedger  ? `text-[26px] font-serif font-bold ${focusText.startsWith('+') ? 'text-[#A6822E]' : 'text-[#8A6D1A]'}`
            : isPayment ? `text-[20px] font-mono ${focusSub.startsWith('已到账') ? 'text-[#D4AF37]' : focusSub.startsWith('已失败') ? 'text-rose-500' : 'text-amber-500'}`
            : isOrder   ? `text-[22px] font-serif font-bold tracking-wide ${isShared ? 'text-white/80' : 'text-[#1A1A1A]/70'}`
            : isCanvas  ? `text-[13px] font-sans font-semibold leading-snug ${isShared ? 'text-white/85' : 'text-[#1A1A1A]/80'}`
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
              isOrder ? `font-serif text-[11px] italic ${isShared ? 'text-white/85' : 'text-[#1A1A1A]/75'}`
                      : `font-mono text-[8px] ${COLOR.focusSub}`
            }`}>{focusSub}</span>}
          </div>

          {/* 右侧叙事区 */}
          <div className="flex-1 min-w-0 pl-6 pr-4 py-2.5 space-y-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-mono text-[8px] tracking-[0.18em] font-bold uppercase truncate ${isShared ? 'text-white/50' : 'text-[#1A1A1A]/50'}`}>{card.module}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`font-mono text-[8px] tracking-widest uppercase ${COLOR.label}`}>{statusLabel}</span>
                {canExpand && <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${expanded ? 'rotate-180' : ''} ${COLOR.label}`} />}
              </div>
            </div>
            {isOrder ? (() => {
              const parts = card.title.split(/\s{2,}/);
              return (
                <div className="flex items-baseline gap-2.5">
                  <span className={`font-sans font-semibold text-[13px] leading-snug ${COLOR.title}`}>{parts[0] ?? ''}</span>
                  <span className="font-serif font-bold text-[26px] leading-none text-[#A6822E] ml-auto mr-8 shrink-0">{parts[1] ?? ''}</span>
                </div>
              );
            })() : (
              <p className={`font-sans font-semibold leading-snug truncate text-[13px] ${isDeleted ? COLOR.titleDel + ' line-through' : COLOR.title}`}>{event?.title ?? tx?.description ?? card.title}</p>
            )}
            {tags.length > 0 && (
              <div className="flex items-center gap-2 pt-0.5">
                {tags.map((tag, i) => <span key={i} className={`font-mono text-[9px] px-1.5 py-0.5 rounded-[1.5px] truncate ${COLOR.tag}`}>{tag}</span>)}
              </div>
            )}
          </div>
        </div>

        {/* L2 展开面板路由 */}
        {canExpand && !isMail && !isVault && !isOrder && !isCanvas && (
          <CardExpandPanel cardTitle={card.title} lang={lang} color={COLOR} canExpandLedger={canExpandLedger}
            expanded={expanded} event={event} tx={tx} stillExists={stillExists}
            scopeGuess={scopeGuess} onCollapse={() => setExpanded(false)} />
        )}
        {isVault && <VaultExpandContent lang={lang} color={COLOR} credentialId={card.id}
          serviceName={focusText} expanded={expanded} scope={vaultScope}
          onScopeChange={setVaultScope} onCollapse={() => setExpanded(false)} />}
        {isOrder && <OrderExpandContent lang={lang} color={COLOR} orderId={card.id}
          expanded={expanded} scope={orderScope} onScopeChange={setOrderScope}
          onCollapse={() => setExpanded(false)} />}
        {isCanvas && (
          <>
            <CanvasExpandContent lang={lang} color={COLOR} docId={card.id}
              expanded={expanded && !canvasEditing} scope={canvasScope}
              onScopeChange={setCanvasScope} onCollapse={() => setExpanded(false)}
              onOpenEditor={() => setCanvasEditing(true)} />
            {canvasEditing && <CanvasEditorContent docId={card.id} onClose={() => setCanvasEditing(false)} />}
          </>
        )}
        {isMail && <MailExpandContent lang={lang} color={COLOR} recipient={focusText}
          subject={card.title} expanded={expanded} scope={mailScope}
          onScopeChange={setMailScope} onCollapse={() => setExpanded(false)}
          onCompose={() => setMailComposing(true)} onComposeClose={() => setMailComposing(false)} />}
      </div>
    </div>
  );
}
