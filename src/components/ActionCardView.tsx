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

const MODULE_COLOR: Record<string, string> = {
  CHRONOS: 'text-amber-400',
  LEDGER:  'text-teal-400',
  PAYMENT: 'text-violet-400',
  MAIL:    'text-sky-400',
  VAULT:   'text-rose-400',
  CANVAS:  'text-emerald-400',
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

  // scope 由内容语义判定（含团队/客户/对方等"涉及他人"关键词 → shared，否则 self）
  // 对内(self)  = PANTONE 10101 C 浅冷灰，文字翻深色
  // 对外(shared)= 暗紫灰 #6B5673，文字保持白色
  const isShared = /团队|客户|经理|对方|共享|协作|分成|开会|会议|对外/.test(card.title + meta.join(''));
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

  // CHRONOS 卡片若携带真实记录 id（创建/更新时由 chronosHandler 写入），就能"原地展开"——
  // 直接读取 scheduleStore 里那条同源记录，和"日程日历"看板完全联动（编辑/删除会同步回去）。
  // 不召唤浮层、不脱离原位置——卡片自己在原地徐徐展开，颜色延续 COLOR（跟卡片一致）。
  // "安静的打开，安静的关上"。
  const isChronos = card.module === 'CHRONOS';
  const canExpandChronos = isChronos && !!card.id && card.action !== 'query';
  const [expanded, setExpanded] = useState(false);

  const [event, setEvent] = useState<EventItem | null>(() =>
    card.id ? scheduleStore.getAll().find(e => e.id === card.id) ?? null : null
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

  // 跟看板保持实时同步——看板那边拖拽/编辑时，展开面板里显示的内容也会刷新
  useEffect(() => {
    if (!canExpandChronos) return;
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
  }, [canExpandChronos, card.id, editing]);

  const catInfo = categoryMap[event?.category ?? eCat];
  const stillExists = !!event;

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
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
    if (!event) return;
    scheduleStore.remove(event.id);
    window.dispatchEvent(new CustomEvent('schedule-updated'));
    setExpanded(false);
    setEditing(false);
  };

  return (
    <div className="mt-3 select-none">
      {/* 外层信封——折叠态与展开态共用同一个容器、同一种底色（原地原色），
          点开不是"召唤新东西"，是这张卡片自己在原地舒展开。 */}
      <div className={`rounded-xl border ${COLOR.border} ${
        isLedger ? 'bg-[#C9BCA8]' : COLOR.body
      } ${
        (canExpandChronos && expanded && CARD_WIDTH_EXPANDED[card.module])
          ? CARD_WIDTH_EXPANDED[card.module]
          : (CARD_WIDTH[card.module] ?? 'w-[400px]')
      } max-w-full overflow-hidden transition-[width] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)]`}>
        <div
          onClick={() => {
            if (isMail) setMailOpen(o => !o);
            else if (canExpandChronos) setExpanded(o => !o);
          }}
          className={`flex h-[104px] ${(isMail || canExpandChronos) ? 'cursor-pointer hover:brightness-110' : ''}`}
        >
          <div
            onClick={(e) => { if (canSwapCurrency) { e.stopPropagation(); toggleSwap(); } }}
            className={`flex flex-col items-center justify-center ${
              // LEDGER 用暖调深咖啡底——比纯黑柔和，又比浅冷灰更衬金色
              isLedger ? 'bg-[#3A332C]' : COLOR.focus
            } shrink-0 overflow-hidden px-3 py-3 w-[148px] ${canSwapCurrency ? 'cursor-pointer hover:brightness-125 active:scale-[0.97] transition' : ''}`}
          >
            <span className={`font-extrabold leading-none tracking-tight truncate text-center w-full text-[20px] ${
              isLedger
                // 与「复式财务账簿」收入卡片同款：墨黑底 + 衬线体，金色（收入）/ 米白（支出）拉满反差
                ? `font-serif ${focusText.startsWith('+') ? 'text-[#E5C158]' : 'text-[#F4F2EE]'}`
                : isPayment
                  ? `font-mono ${focusSub.startsWith('已到账') ? 'text-[#D4AF37]' : focusSub.startsWith('已失败') ? 'text-rose-500' : 'text-amber-500'}`
                  : `font-mono ${isShared ? 'text-amber-400/90' : 'text-[#1A1A1A]/70'}`
            }`}>{focusText}</span>
            {focusSub && <span className={`font-mono text-[8px] mt-1.5 tracking-wide truncate text-center w-full ${COLOR.focusSub}`}>{focusSub}</span>}
          </div>
          <div className="flex-1 min-w-0 pl-4.5 pr-3.5 py-2.5 space-y-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-mono text-[8px] tracking-[0.18em] font-bold uppercase truncate ${
                // LEDGER 右侧是中调暖灰棕底（#A49587，与左侧同色系），改用深咖啡文字保证清晰
                isLedger ? 'text-[#3A332C]' : (MODULE_COLOR[card.module] ?? (isShared ? 'text-white/50' : 'text-[#1A1A1A]/50'))
              }`}>{card.module}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`font-mono text-[8px] tracking-widest uppercase ${isLedger ? 'text-[#3A332C]/55' : COLOR.label}`}>{statusLabel}</span>
                {canExpandChronos && (
                  <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${expanded ? 'rotate-180' : ''} ${isLedger ? 'text-[#3A332C]/45' : COLOR.label}`} />
                )}
              </div>
            </div>
            <p className={`font-sans font-semibold leading-snug truncate text-[13px] ${isDeleted ? COLOR.titleDel + ' line-through' : isLedger ? 'text-[#2A241F]' : COLOR.title}`}>{card.title}</p>
            {tags.length > 0 && (
              <div className="flex items-center gap-2 pt-0.5">
                {tags.map((tag, i) => (
                  <span key={i} className={`font-mono text-[9px] px-1.5 py-0.5 rounded-[1.5px] truncate ${isLedger ? 'text-[#3A332C]/70 bg-[#3A332C]/[0.1]' : COLOR.tag}`}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 原地徐徐展开的详情面板——grid-rows 0fr → 1fr 的高度过渡，
            "安静的打开，安静的关上"：开合走同一条曲线，互为镜像。 */}
        {canExpandChronos && (
          <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className={`px-4 pb-4 pt-3 border-t ${COLOR.panelBorder} space-y-3`} onClick={e => e.stopPropagation()}>
                {!stillExists ? (
                  <p className={`text-[11px] font-mono uppercase tracking-widest py-3 text-center ${COLOR.panelLabel}`}>
                    {lang === 'zh' ? '该记录已不存在于日程看板（可能已被删除）' : 'This record no longer exists on the board'}
                  </p>
                ) : !editing ? (
                  <>
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
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={handleDelete}
                        className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnDanger}`}>
                        {lang === 'zh' ? '销毁日程' : 'Delete'}
                      </button>
                      <button type="button" onClick={() => setEditing(true)}
                        className={`px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded-md flex items-center gap-1.5 transition ${COLOR.btnPrimary}`}>
                        <Edit2 className="w-3 h-3" />{lang === 'zh' ? '修改编纂' : 'Revise'}
                      </button>
                    </div>
                  </>
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
