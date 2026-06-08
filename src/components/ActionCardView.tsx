/**
 * ActionCardView — 神机百炼 · 操作卡片渲染
 * 从 ChatModule.tsx 拆出（保持核心壳文件精简、稳定）。
 * 深色基调，呼应用户气泡（bg-[#1A1A1A]）与 `>` 引用块的暗色细节语言。
 */
import { useState, useEffect, FormEvent } from 'react';
import { Clock, MapPin, Edit2, ChevronDown } from 'lucide-react';
import MailCardExpand from './MailCardExpand';
import { ActionCard } from '../types/chat';
import { Currency, detectSymbolCurrency } from '../utils/exchangeRate';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { EventItem, ColumnId, EventCategory } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';
import { scheduleStore } from '../stores/scheduleStore';
import { ledgerStore, Transaction } from '../stores/ledgerStore';

// 记账分类的简短中/英文标签——编辑表单用，与「复式财务账簿」的命名体系保持一致
const LEDGER_CATEGORY_LABEL: Record<Transaction['category'], { zh: string; en: string }> = {
  royalty:     { zh: '版税授权', en: 'Royalty' },
  commission:  { zh: '高定佣金', en: 'Commission' },
  material:    { zh: '物料介质', en: 'Material' },
  server:      { zh: '云端节点', en: 'Server' },
  marketing:   { zh: '推广公关', en: 'Marketing' },
  consultancy: { zh: '顾问咨询', en: 'Consultancy' },
};

const ACTION_LABEL_ZH: Record<string, string> = {
  create: '已建立', update: '已更新', delete: '已删除', query: '今日日程',
};
const ACTION_LABEL_EN: Record<string, string> = {
  create: 'CREATED', update: 'UPDATED', delete: 'DELETED', query: 'TODAY',
};
// 卡片整体宽度固定为几档标准值（按模块分类），不再随内容长度"自动"伸缩——
// 左侧聚焦栏宽度恒为 148px，右侧信息栏靠这套标准宽度撑满剩余空间，
// 这样不同卡片的左右比例始终一致，不会出现忽宽忽窄的"比例感"问题。
const CARD_WIDTH: Record<string, string> = {
  LEDGER:  'w-[420px]',
  PAYMENT: 'w-[420px]',
  CHRONOS: 'w-[360px]',
  MAIL:    'w-[400px]',
  VAULT:   'w-[400px]',
  CANVAS:  'w-[400px]',
};
// 展开态下，宽度跟着高度一起"等比例"舒展开——详情字段（日程期间/精确时刻/场地）
// 需要更舒展的横向呼吸感，不止是长高。开合两态的宽度都明确给出具体值，
// 配合 transition-[width] 才能像高度一样平滑过渡（auto 宽度无法被动画）。
const CARD_WIDTH_EXPANDED: Record<string, string> = {
  CHRONOS: 'w-[420px]',
  LEDGER:  'w-[420px]',
};

export function ActionCardView({ card, lang }: { card: ActionCard; lang: 'zh' | 'en' }) {
  const isDeleted = card.action === 'delete';
  const statusLabel = lang === 'zh'
    ? ACTION_LABEL_ZH[card.action] ?? ''
    : ACTION_LABEL_EN[card.action] ?? '';

  const meta = card.meta.filter(Boolean);
  const isLedger  = card.module === 'LEDGER';
  const isPayment = card.module === 'PAYMENT';

  // LEDGER:  meta[0]=金额(±N), meta[1]=日期, meta[2]=category — focus列只显示金额，其余全进右侧标签
  // PAYMENT: meta[0]=金额(+N), meta[1]=状态(待支付/已到账), meta[2]=支付方式, meta[3]=订单号
  //          — focus 列显示金额+状态，状态决定金额配色（待支付=琥珀/已到账=青绿/失败=玫瑰红）
  // CHRONOS: meta[0]="2026-06-08 · 15:00" — 转换 12h 制时间作 focusText，日期作 focusSub
  let focusText = meta[0] ?? card.title;
  let focusSub  = meta[1] ?? '';
  let tags      = meta.slice(2);

  // 点击金额可在 ¥ / $ 之间切换显示——按实时汇率互换原始值与换算参考值。
  // 这是「全局联动」开关：点击任意一张带货币的卡片，全站（含财务账簿）所有金额
  // 一起切换，并跨刷新/切换会话/标签页持久同步——详见 useDisplayCurrency。
  const originalCurrency: Currency = detectSymbolCurrency(meta[0] ?? '');
  const [displayCurrency, toggleDisplayCurrency] = useDisplayCurrency();
  const swapped = displayCurrency !== originalCurrency;
  const canSwapCurrency = (isLedger || isPayment) && /[¥$]/.test(meta[1] ?? '');
  const toggleSwap = toggleDisplayCurrency;

  if (isLedger) {
    const original    = meta[0] ?? '';                 // "±100¥"
    const convertedRaw = meta[1] ?? '';                // "≈ 13.9$"
    if (swapped && convertedRaw) {
      const sign         = original.match(/^[+-]/)?.[0] ?? '';
      const originalNum  = original.replace(/^[+-]/, '');
      const convertedNum = convertedRaw.replace(/^≈\s*/, '');
      focusText = `${sign}${convertedNum}`;
      tags      = [`≈ ${originalNum}`, ...meta.slice(2)];
    } else {
      focusText = original;
      tags      = meta.slice(1);  // 换算参考值 + 日期 + category 进右侧小标签
    }
    focusSub = '';                // 不在 focus 列显示日期
  } else if (isPayment) {
    const original = meta[0] ?? '';                    // "+100¥"
    const subRaw   = meta[1] ?? '';                    // "已到账 · ≈ 13.9$"
    const subMatch = subRaw.match(/^(.*?)(?:\s*·\s*≈\s*(.+))?$/);
    const statusLabel  = subMatch?.[1] ?? subRaw;
    const convertedNum = subMatch?.[2] ?? '';
    if (swapped && convertedNum) {
      const sign        = original.match(/^[+-]/)?.[0] ?? '';
      const originalNum = original.replace(/^[+-]/, '');
      focusText = `${sign}${convertedNum}`;
      focusSub  = `${statusLabel} · ≈ ${originalNum}`;
    } else {
      focusText = original;
      focusSub  = subRaw;
    }
    tags = meta.slice(2);  // 支付方式 + 订单号
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

  // scope：默认由内容语义算法判定（含团队/客户/对方等"涉及他人"关键词 → shared，否则 self），
  // 但用户可以在展开面板里手动切换「个人 / 团队」——一旦手动选择过，
  // event.scope 会被持久化，此后永久优先于算法猜测（算法只是兜底默认值，不是最终裁决）。
  // 对内(self)  = PANTONE 10101 C 浅冷灰，文字翻深色
  // 对外(shared)= 暗紫灰 #6B5673，文字保持白色
  const scopeGuess = /团队|客户|经理|对方|共享|协作|分成|开会|会议|对外/.test(card.title + meta.join(''))
    ? 'shared' : 'self';
  // CHRONOS 读 scheduleStore，LEDGER 读 ledgerStore——记录里持久化的 scope 永远优先于算法猜测
  const persistedScope = !card.id ? undefined
    : isLedger
      ? ledgerStore.getAll().find(t => t.id === card.id)?.scope
      : scheduleStore.getAll().find(e => e.id === card.id)?.scope;
  const isShared = (persistedScope ?? scopeGuess) === 'shared';
  const COLOR = isShared
    ? {
        // PANTONE 18-4039 TCX "Regatta" ≈ #4F77AC（对外·蓝）— focus 用更深的同色相调暗版
        focus:      'bg-[#3C5D88]',
        body:       'bg-[#4F77AC]',
        border:     'border-white/[0.05]',
        focusSub:   'text-white/30',
        label:      'text-white/30',
        title:      'text-white/90',
        titleDel:   'text-white/40',
        tag:        'text-white/35 bg-white/[0.04]',
        // 展开面板沿用同一色相——「原地原色」，不另起配色体系
        panelBorder: 'border-white/[0.12]',
        panelLabel:  'text-white/40',
        panelText:   'text-white/85',
        panelInput:  'bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/45',
        btnGhost:    'bg-white/10 hover:bg-white/[0.18] text-white/70',
        btnPrimary:  'bg-white text-[#3C5D88] hover:bg-white/90',
        // 危险操作不靠"红底"喧宾夺主——延续卡片自身的克制基调，只用文字色暗示警示
        btnDanger:   'bg-white/10 hover:bg-white/[0.16] text-rose-200/75 hover:text-rose-100',
      }
    : {
        // PANTONE 10101 C ≈ #C8C9C7（对内·冷灰）
        focus:      'bg-[#B8B9B7]',
        body:       'bg-[#C8C9C7]',
        border:     'border-[#1A1A1A]/[0.08]',
        focusSub:   'text-[#1A1A1A]/40',
        label:      'text-[#1A1A1A]/35',
        title:      'text-[#1A1A1A]/85',
        titleDel:   'text-[#1A1A1A]/30',
        tag:        'text-[#1A1A1A]/50 bg-[#1A1A1A]/[0.07]',
        panelBorder: 'border-[#1A1A1A]/[0.10]',
        panelLabel:  'text-[#1A1A1A]/40',
        panelText:   'text-[#1A1A1A]/80',
        panelInput:  'bg-[#1A1A1A]/[0.05] border-[#1A1A1A]/15 text-[#1A1A1A]/85 placeholder:text-[#1A1A1A]/30 focus:border-[#1A1A1A]/35',
        btnGhost:    'bg-[#1A1A1A]/[0.06] hover:bg-[#1A1A1A]/[0.10] text-[#1A1A1A]/60',
        btnPrimary:  'bg-[#1A1A1A] text-[#F4F2EE] hover:bg-[#1A1A1A]/85',
        btnDanger:   'bg-[#1A1A1A]/[0.06] hover:bg-[#1A1A1A]/[0.10] text-rose-700/55 hover:text-rose-700/80',
      };

  const isMail = card.module === 'MAIL';
  const [mailOpen, setMailOpen] = useState(false);

  // CHRONOS / LEDGER 卡片若携带真实记录 id（创建/更新时由对应 handler 写入），
  // 就能"原地展开"——直接读取 scheduleStore / ledgerStore 里那条同源记录，
  // 和"日程日历"/"复式财务账簿"看板完全联动（编辑/删除会同步回去）。
  // 不召唤浮层、不脱离原位置——卡片自己在原地徐徐展开，颜色延续 COLOR（跟卡片一致）。
  // "安静的打开，安静的关上"——两个模块共用同一套展开/编辑/归属切换交互，原样照搬，不另起一套。
  const isChronos = card.module === 'CHRONOS';
  const canExpandChronos = isChronos && !!card.id && card.action !== 'query';
  const canExpandLedger  = isLedger  && !!card.id && card.action !== 'query';
  const canExpand = canExpandChronos || canExpandLedger;
  const [expanded, setExpanded] = useState(false);

  const [event, setEvent] = useState<EventItem | null>(() =>
    canExpandChronos && card.id ? scheduleStore.getAll().find(e => e.id === card.id) ?? null : null
  );
  const [tx, setTx] = useState<Transaction | null>(() =>
    canExpandLedger && card.id ? ledgerStore.getAll().find(t => t.id === card.id) ?? null : null
  );
  const [editing,  setEditing]  = useState(false);
  const [eTitle,   setETitle]   = useState(event?.title ?? card.title);
  const [eSub,     setESub]     = useState(event?.subtitle ?? '');
  const [eTime,    setETime]    = useState(event?.time ?? '');
  const [eDate,    setEDate]    = useState(event?.date ?? '');
  const [eEnd,     setEEnd]     = useState(event?.endDate || event?.date || '');
  const [eCat,     setECat]     = useState<EventCategory>(event?.category ?? 'strategy');
  const [eLoc,     setELoc]     = useState(event?.location ?? '');
  const [eStatus,  setEStatus]  = useState<ColumnId>(event?.status ?? 'todo');

  const [lDesc,     setLDesc]     = useState(tx?.description ?? card.title);
  const [lAmount,   setLAmount]   = useState(String(tx?.amount ?? ''));
  const [lType,     setLType]     = useState<Transaction['type']>(tx?.type ?? 'expense');
  const [lCategory, setLCategory] = useState<Transaction['category']>(tx?.category ?? 'material');
  const [lDate,     setLDate]     = useState(tx?.date ?? '');
  const [lNotes,    setLNotes]    = useState(tx?.notes ?? '');

  // 跟看板保持实时同步——看板那边拖拽/编辑时，展开面板里显示的内容也会刷新
  useEffect(() => {
    if (canExpandChronos) {
      const sync = () => {
        const fresh = scheduleStore.getAll().find(e => e.id === card.id) ?? null;
        setEvent(fresh);
        if (fresh && !editing) {
          setETitle(fresh.title); setESub(fresh.subtitle); setETime(fresh.time);
          setEDate(fresh.date); setEEnd(fresh.endDate || fresh.date);
          setECat(fresh.category); setELoc(fresh.location); setEStatus(fresh.status);
        }
      };
      window.addEventListener('schedule-updated', sync);
      return () => window.removeEventListener('schedule-updated', sync);
    }
    if (canExpandLedger) {
      const sync = () => {
        const fresh = ledgerStore.getAll().find(t => t.id === card.id) ?? null;
        setTx(fresh);
        if (fresh && !editing) {
          setLDesc(fresh.description); setLAmount(String(fresh.amount)); setLType(fresh.type);
          setLCategory(fresh.category); setLDate(fresh.date); setLNotes(fresh.notes ?? '');
        }
      };
      window.addEventListener('ledger-updated', sync);
      return () => window.removeEventListener('ledger-updated', sync);
    }
  }, [canExpandChronos, canExpandLedger, card.id, editing]);

  const catInfo = categoryMap[event?.category ?? eCat];
  const stillExists = canExpandLedger ? !!tx : !!event;
  // 归属判断的落点——CHRONOS 用 event，LEDGER 用 tx，二者互斥但读法一致
  const scopeRecord = canExpandLedger ? tx : event;

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (canExpandLedger) {
      if (!lDesc.trim() || !tx) return;
      const amountNum = parseFloat(lAmount);
      if (!Number.isFinite(amountNum)) return;
      ledgerStore.update(tx.id, {
        description: lDesc, amount: amountNum, type: lType,
        category: lCategory, date: lDate, notes: lNotes,
      });
      window.dispatchEvent(new CustomEvent('ledger-updated'));
      setEditing(false);
      return;
    }
    if (!eTitle.trim() || !event) return;
    scheduleStore.update(event.id, {
      title: eTitle, subtitle: eSub, time: eTime, date: eDate,
      endDate: eEnd || eDate, category: eCat, location: eLoc,
      status: eStatus, completed: eStatus === 'done',
    });
    window.dispatchEvent(new CustomEvent('schedule-updated'));
    setEditing(false);
  };

  const handleDelete = () => {
    if (canExpandLedger) {
      if (!tx) return;
      ledgerStore.remove(tx.id);
      window.dispatchEvent(new CustomEvent('ledger-updated'));
      setExpanded(false);
      setEditing(false);
      return;
    }
    if (!event) return;
    scheduleStore.remove(event.id);
    window.dispatchEvent(new CustomEvent('schedule-updated'));
    setExpanded(false);
    setEditing(false);
  };

  const setScope = (s: 'self' | 'shared') => {
    if (canExpandLedger && tx) {
      ledgerStore.update(tx.id, { scope: s });
      window.dispatchEvent(new CustomEvent('ledger-updated'));
    } else if (event) {
      scheduleStore.update(event.id, { scope: s });
      window.dispatchEvent(new CustomEvent('schedule-updated'));
    }
  };

  return (
    <div className="mt-3 select-none">
      {/* 外层信封——折叠态与展开态共用同一个容器、同一种底色（原地原色），
          点开不是"召唤新东西"，是这张卡片自己在原地舒展开。 */}
      <div className={`rounded-xl border ${COLOR.border} ${COLOR.body} ${
        (canExpand && expanded && CARD_WIDTH_EXPANDED[card.module])
          ? CARD_WIDTH_EXPANDED[card.module]
          : (CARD_WIDTH[card.module] ?? 'w-[400px]')
      } max-w-full overflow-hidden transition-[width,box-shadow] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        canExpand && expanded
          ? 'shadow-[inset_0_1px_5px_rgba(0,0,0,0.07),_0_6px_20px_-4px_rgba(0,0,0,0.10)]'
          : ''
      }`}>
        <div
          onClick={() => {
            if (isMail) setMailOpen(o => !o);
            else if (canExpand) setExpanded(o => !o);
          }}
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
                // 与「复式财务账簿」金额同款：衬线体 + 粗体收紧字距，深金（收入）/ 暗金（支出）——
                // 浅金在浅灰底上对比度太低看不清，改用更暗更沉的金棕色调保证可读性
                ? `text-[26px] font-serif font-bold ${focusText.startsWith('+') ? 'text-[#A6822E]' : 'text-[#8A6D1A]'}`
                : isPayment
                  ? `text-[20px] font-mono ${focusSub.startsWith('已到账') ? 'text-[#D4AF37]' : focusSub.startsWith('已失败') ? 'text-rose-500' : 'text-amber-500'}`
                  : `text-[20px] font-mono ${isShared ? 'text-white/80' : 'text-[#1A1A1A]/70'}`
            }`}>
              {isLedger ? (() => {
                const m = focusText.match(/^([+-])([¥$])\s*(.+)$/);
                if (!m) return focusText;
                const [, sign, symbol, num] = m;
                return <>{sign}{num}<span className="ml-1 text-[0.55em] align-baseline opacity-80">{symbol}</span></>;
              })() : focusText}
            </span>
            {focusSub && <span className={`font-mono text-[8px] mt-1.5 tracking-wide truncate text-center w-full ${COLOR.focusSub}`}>{focusSub}</span>}
          </div>
          <div className="flex-1 min-w-0 pl-4.5 pr-3.5 py-2.5 space-y-1 flex flex-col justify-center">
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

        {/* 原地徐徐展开的详情面板——grid-rows 0fr → 1fr 的高度过渡，
            "安静的打开，安静的关上"：开合走同一条曲线，互为镜像。 */}
        {canExpand && (
          <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className={`px-4 pb-4 pt-3 border-t ${COLOR.panelBorder} space-y-3`} onClick={e => e.stopPropagation()}>
                {!stillExists ? (
                  <p className={`text-[11px] font-mono uppercase tracking-widest py-3 text-center ${COLOR.panelLabel}`}>
                    {lang === 'zh'
                      ? `该记录已不存在于${canExpandLedger ? '财务账簿' : '日程看板'}（可能已被删除）`
                      : 'This record no longer exists on the board'}
                  </p>
                ) : !editing ? (
                  <>
                    {canExpandLedger ? (
                      <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                        <div className="space-y-1">
                          <p className={`text-[8px] uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '收支日期' : 'DATE'}</p>
                          <p className={`font-bold flex items-center gap-1 ${COLOR.panelText}`}><Clock className="w-3 h-3" />{tx!.date}</p>
                        </div>
                        <div className="space-y-1">
                          <p className={`text-[8px] uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '科目分类' : 'CATEGORY'}</p>
                          <p className={`font-bold ${COLOR.panelText}`}>{lang === 'zh' ? LEDGER_CATEGORY_LABEL[tx!.category].zh : LEDGER_CATEGORY_LABEL[tx!.category].en}</p>
                        </div>
                        <div className="space-y-1 col-span-2 pt-1.5 border-t border-current/10">
                          <p className={`text-[8px] uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '事项备注' : 'NOTES'}</p>
                          <p className={`font-bold truncate ${COLOR.panelText}`}>{tx!.notes || '—'}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                        <div className="space-y-1">
                          <p className={`text-[8px] uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '日程期间' : 'DATE RANGE'}</p>
                          <p className={`font-bold ${COLOR.panelText}`}>
                            {event!.endDate && event!.endDate !== event!.date
                              ? <span>{event!.date} {lang === 'zh' ? '至' : 'to'} {event!.endDate}</span>
                              : event!.date}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className={`text-[8px] uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '精确时刻' : 'TIME'}</p>
                          <p className={`font-bold flex items-center gap-1 ${COLOR.panelText}`}><Clock className="w-3 h-3" />{event!.time}</p>
                        </div>
                        <div className="space-y-1 col-span-2 pt-1.5 border-t border-current/10">
                          <p className={`text-[8px] uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '场地节点' : 'LOCATION'}</p>
                          <p className={`font-bold flex items-center gap-1 truncate ${COLOR.panelText}`}><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{event!.location || '—'}</span></p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex gap-1.5">
                        {(['self', 'shared'] as const).map(s => {
                          const active = (scopeRecord?.scope ?? scopeGuess) === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              title={lang === 'zh' ? '归属（可手动改写算法判断）' : 'Scope (overrides auto-detection)'}
                              onClick={() => setScope(s)}
                              className={`px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${
                                active ? COLOR.btnPrimary : COLOR.btnGhost
                              }`}
                            >
                              {s === 'self'
                                ? (lang === 'zh' ? '个人' : 'Personal')
                                : (lang === 'zh' ? '团队' : 'Team')}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleDelete}
                          className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnDanger}`}>
                          {lang === 'zh' ? (canExpandLedger ? '销毁记账' : '销毁日程') : 'Delete'}
                        </button>
                        <button type="button" onClick={() => setEditing(true)}
                          className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md flex items-center gap-1.5 transition ${COLOR.btnPrimary}`}>
                          <Edit2 className="w-3 h-3" />{lang === 'zh' ? '修改编纂' : 'Revise'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : canExpandLedger ? (
                  <form onSubmit={handleSave} className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="col-span-2">
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '事项描述' : 'DESCRIPTION'}</label>
                        <input type="text" required value={lDesc} onChange={e => setLDesc(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                      </div>
                      <div>
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '金额' : 'AMOUNT'}</label>
                        <input type="number" required min="0" step="0.01" value={lAmount} onChange={e => setLAmount(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none font-mono ${COLOR.panelInput}`} />
                      </div>
                      <div>
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '收 / 支' : 'TYPE'}</label>
                        <select value={lType} onChange={e => setLType(e.target.value as Transaction['type'])}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none font-mono ${COLOR.panelInput}`}>
                          <option value="expense">{lang === 'zh' ? '支出' : 'Expense'}</option>
                          <option value="income">{lang === 'zh' ? '收入' : 'Income'}</option>
                        </select>
                      </div>
                      <div>
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '日期' : 'DATE'}</label>
                        <input type="date" required value={lDate} onChange={e => setLDate(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none font-mono [color-scheme:dark] ${COLOR.panelInput}`} />
                      </div>
                      <div>
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '科目分类' : 'CATEGORY'}</label>
                        <select value={lCategory} onChange={e => setLCategory(e.target.value as Transaction['category'])}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none font-mono ${COLOR.panelInput}`}>
                          {(Object.keys(LEDGER_CATEGORY_LABEL) as Transaction['category'][]).map(c => (
                            <option key={c} value={c}>{lang === 'zh' ? LEDGER_CATEGORY_LABEL[c].zh : LEDGER_CATEGORY_LABEL[c].en}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '事项备注' : 'NOTES'}</label>
                        <input type="text" value={lNotes} onChange={e => setLNotes(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setEditing(false)}
                        className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnGhost}`}>
                        {lang === 'zh' ? '返回' : 'Back'}
                      </button>
                      <button type="submit"
                        className={`px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnPrimary}`}>
                        {lang === 'zh' ? '确认保存' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSave} className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="col-span-2">
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '标题' : 'TITLE'}</label>
                        <input type="text" required value={eTitle} onChange={e => setETitle(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                      </div>
                      <div>
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '日期' : 'DATE'}</label>
                        <input type="date" required value={eDate} onChange={e => setEDate(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none font-mono [color-scheme:dark] ${COLOR.panelInput}`} />
                      </div>
                      <div>
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '时间' : 'TIME'}</label>
                        <input type="time" required value={eTime} onChange={e => setETime(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none font-mono [color-scheme:dark] ${COLOR.panelInput}`} />
                      </div>
                      <div className="col-span-2">
                        <label className={`block text-[8px] font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '场地节点' : 'LOCATION'}</label>
                        <input type="text" value={eLoc} onChange={e => setELoc(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setEditing(false)}
                        className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnGhost}`}>
                        {lang === 'zh' ? '返回' : 'Back'}
                      </button>
                      <button type="submit"
                        className={`px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnPrimary}`}>
                        {lang === 'zh' ? '确认保存' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isMail && mailOpen && (
        <MailCardExpand
          recipient={focusText !== card.title ? focusText : ''}
          subject={card.title}
          onClose={() => setMailOpen(false)}
        />
      )}
    </div>
  );
}
