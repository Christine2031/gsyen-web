// 卡片展开面板 —— CHRONOS/LEDGER 共用的「原地展开 + 编辑 + 归属切换」。
// 自管编辑态；event/tx 由父组件传入（折叠态卡片头也要读），保存/删除直写对应 store。
import { useState, useEffect, FormEvent } from 'react';
import { Clock, MapPin, Edit2 } from 'lucide-react';
import { EventItem, ColumnId, EventCategory } from '../types/schedule';
import { scheduleStore } from '../stores/scheduleStore';
import { ledgerStore, Transaction } from '../stores/ledgerStore';
import { LEDGER_CATEGORY_LABEL, CardColor } from './cardConstants';

interface CardExpandPanelProps {
  cardTitle: string;
  lang: 'zh' | 'en';
  color: CardColor;
  canExpandLedger: boolean;
  expanded: boolean;
  event: EventItem | null;
  tx: Transaction | null;
  stillExists: boolean;
  scopeGuess: 'self' | 'shared';
  onCollapse: () => void;
}

export function CardExpandPanel({
  cardTitle, lang, color: COLOR, canExpandLedger, expanded,
  event, tx, stillExists, scopeGuess, onCollapse,
}: CardExpandPanelProps) {
  const [editing, setEditing] = useState(false);

  // CHRONOS 编辑字段（eSub/eEnd/eCat/eStatus 不在表单里，但保存时需原样保留）
  const [eTitle,  setETitle]  = useState(event?.title ?? cardTitle);
  const [eSub,    setESub]    = useState(event?.subtitle ?? '');
  const [eTime,   setETime]   = useState(event?.time ?? '');
  const [eDate,   setEDate]   = useState(event?.date ?? '');
  const [eEnd,    setEEnd]    = useState(event?.endDate || event?.date || '');
  const [eCat,    setECat]    = useState<EventCategory>(event?.category ?? 'strategy');
  const [eLoc,    setELoc]    = useState(event?.location ?? '');
  const [eStatus, setEStatus] = useState<ColumnId>(event?.status ?? 'todo');

  // LEDGER 编辑字段
  const [lDesc,     setLDesc]     = useState(tx?.description ?? cardTitle);
  const [lAmount,   setLAmount]   = useState(String(tx?.amount ?? ''));
  const [lType,     setLType]     = useState<Transaction['type']>(tx?.type ?? 'expense');
  const [lCategory, setLCategory] = useState<Transaction['category']>(tx?.category ?? 'material');
  const [lDate,     setLDate]     = useState(tx?.date ?? '');
  const [lNotes,    setLNotes]    = useState(tx?.notes ?? '');

  // 父组件刷新 event/tx 时，非编辑态下同步表单字段（与看板实时联动）。
  useEffect(() => {
    if (editing) return;
    if (event) {
      setETitle(event.title); setESub(event.subtitle); setETime(event.time);
      setEDate(event.date); setEEnd(event.endDate || event.date);
      setECat(event.category); setELoc(event.location); setEStatus(event.status);
    }
    if (tx) {
      setLDesc(tx.description); setLAmount(String(tx.amount)); setLType(tx.type);
      setLCategory(tx.category); setLDate(tx.date); setLNotes(tx.notes ?? '');
    }
  }, [event, tx, editing]);

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
    if (canExpandLedger && tx) {
      ledgerStore.remove(tx.id);
      window.dispatchEvent(new CustomEvent('ledger-updated'));
    } else if (event) {
      scheduleStore.remove(event.id);
      window.dispatchEvent(new CustomEvent('schedule-updated'));
    } else return;
    setEditing(false);
    onCollapse();
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
    <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <div className={`px-4 pb-4 pt-3 border-t ${COLOR.panelBorder} space-y-3`} onClick={e => e.stopPropagation()}>
          {!stillExists ? (
            <p className={`text-(--fs-md) font-mono uppercase tracking-widest py-3 text-center ${COLOR.panelLabel}`}>
              {lang === 'zh'
                ? `该记录已不存在于${canExpandLedger ? '财务账簿' : '日程看板'}（可能已被删除）`
                : 'This record no longer exists on the board'}
            </p>
          ) : !editing ? (
            <>
              {canExpandLedger ? (
                <div className="grid grid-cols-2 gap-3 text-(--fs-md) font-mono">
                  <div className="space-y-1">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '收支日期' : 'DATE'}</p>
                    <p className={`font-bold flex items-center gap-1 ${COLOR.panelText}`}><Clock className="w-3 h-3" />{tx!.date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '科目分类' : 'CATEGORY'}</p>
                    <p className={`font-bold ${COLOR.panelText}`}>{lang === 'zh' ? LEDGER_CATEGORY_LABEL[tx!.category].zh : LEDGER_CATEGORY_LABEL[tx!.category].en}</p>
                  </div>
                  <div className="space-y-1 col-span-2 pt-1.5 border-t border-current/10">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '事项备注' : 'NOTES'}</p>
                    <p className={`font-bold truncate ${COLOR.panelText}`}>{tx!.notes || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-(--fs-md) font-mono">
                  <div className="space-y-1">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '日程期间' : 'DATE RANGE'}</p>
                    <p className={`font-bold ${COLOR.panelText}`}>
                      {event!.endDate && event!.endDate !== event!.date
                        ? <span>{event!.date} {lang === 'zh' ? '至' : 'to'} {event!.endDate}</span>
                        : event!.date}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '精确时刻' : 'TIME'}</p>
                    <p className={`font-bold flex items-center gap-1 ${COLOR.panelText}`}><Clock className="w-3 h-3" />{event!.time}</p>
                  </div>
                  <div className="space-y-1 col-span-2 pt-1.5 border-t border-current/10">
                    <p className={`text-(--fs-2xs) uppercase tracking-widest ${COLOR.panelLabel}`}>{lang === 'zh' ? '场地节点' : 'LOCATION'}</p>
                    <p className={`font-bold flex items-center gap-1 truncate ${COLOR.panelText}`}><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{event!.location || '—'}</span></p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex gap-1.5">
                  {(['self', 'shared'] as const).map(s => {
                    const active = (scopeRecord?.scope ?? scopeGuess) === s;
                    return (
                      <button key={s} type="button"
                        title={lang === 'zh' ? '归属（可手动改写算法判断）' : 'Scope (overrides auto-detection)'}
                        onClick={() => setScope(s)}
                        className={`px-3 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${active ? COLOR.btnPrimary : COLOR.btnGhost}`}>
                        {s === 'self' ? (lang === 'zh' ? '个人' : 'Personal') : (lang === 'zh' ? '团队' : 'Team')}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleDelete}
                    className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnDanger}`}>
                    {lang === 'zh' ? (canExpandLedger ? '销毁记账' : '销毁日程') : 'Delete'}
                  </button>
                  <button type="button" onClick={() => setEditing(true)}
                    className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md flex items-center gap-1.5 transition ${COLOR.btnPrimary}`}>
                    <Edit2 className="w-3 h-3" />{lang === 'zh' ? '修改编纂' : 'Revise'}
                  </button>
                </div>
              </div>
            </>
          ) : canExpandLedger ? (
            <form onSubmit={handleSave} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '事项描述' : 'DESCRIPTION'}</label>
                  <input type="text" required value={lDesc} onChange={e => setLDesc(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                </div>
                <div>
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '金额' : 'AMOUNT'}</label>
                  <input type="number" required min="0" step="0.01" value={lAmount} onChange={e => setLAmount(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none font-mono ${COLOR.panelInput}`} />
                </div>
                <div>
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '收 / 支' : 'TYPE'}</label>
                  <select value={lType} onChange={e => setLType(e.target.value as Transaction['type'])}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none font-mono ${COLOR.panelInput}`}>
                    <option value="expense">{lang === 'zh' ? '支出' : 'Expense'}</option>
                    <option value="income">{lang === 'zh' ? '收入' : 'Income'}</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '日期' : 'DATE'}</label>
                  <input type="date" required value={lDate} onChange={e => setLDate(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none font-mono [color-scheme:dark] ${COLOR.panelInput}`} />
                </div>
                <div>
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '科目分类' : 'CATEGORY'}</label>
                  <select value={lCategory} onChange={e => setLCategory(e.target.value as Transaction['category'])}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none font-mono ${COLOR.panelInput}`}>
                    {(Object.keys(LEDGER_CATEGORY_LABEL) as Transaction['category'][]).map(c => (
                      <option key={c} value={c}>{lang === 'zh' ? LEDGER_CATEGORY_LABEL[c].zh : LEDGER_CATEGORY_LABEL[c].en}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '事项备注' : 'NOTES'}</label>
                  <input type="text" value={lNotes} onChange={e => setLNotes(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)}
                  className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnGhost}`}>
                  {lang === 'zh' ? '返回' : 'Back'}
                </button>
                <button type="submit"
                  className={`px-4 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnPrimary}`}>
                  {lang === 'zh' ? '确认保存' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSave} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '标题' : 'TITLE'}</label>
                  <input type="text" required value={eTitle} onChange={e => setETitle(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                </div>
                <div>
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '日期' : 'DATE'}</label>
                  <input type="date" required value={eDate} onChange={e => setEDate(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none font-mono [color-scheme:dark] ${COLOR.panelInput}`} />
                </div>
                <div>
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '时间' : 'TIME'}</label>
                  <input type="time" required value={eTime} onChange={e => setETime(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none font-mono [color-scheme:dark] ${COLOR.panelInput}`} />
                </div>
                <div className="col-span-2">
                  <label className={`block text-(--fs-2xs) font-mono uppercase mb-1 ${COLOR.panelLabel}`}>{lang === 'zh' ? '场地节点' : 'LOCATION'}</label>
                  <input type="text" value={eLoc} onChange={e => setELoc(e.target.value)}
                    className={`w-full text-(--fs-md) px-2 py-1.5 rounded-md border outline-none ${COLOR.panelInput}`} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)}
                  className={`px-3.5 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnGhost}`}>
                  {lang === 'zh' ? '返回' : 'Back'}
                </button>
                <button type="submit"
                  className={`px-4 py-1.5 text-(--fs-xs) font-mono uppercase tracking-widest rounded-md transition ${COLOR.btnPrimary}`}>
                  {lang === 'zh' ? '确认保存' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
