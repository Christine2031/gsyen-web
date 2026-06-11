/**
 * ScheduleMonthView — 42-slot month grid with drag-drop + quick-add.
 */
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { EventItem } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';
import { isEventOnDate } from '../hooks/useCalendarDays';

interface CalendarDay {
  dayNum: number; dateString: string;
  isCurrentMonth: boolean; isToday: boolean; hasEvents: boolean;
}

interface Props {
  lang: 'zh' | 'en';
  mainCalendarGridDays: CalendarDay[];
  activeFilteredList: EventItem[];
  dragOverDate: string | null;
  draggingId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOverDate: (e: React.DragEvent, dateStr: string) => void;
  onDropDate: (e: React.DragEvent, dateStr: string) => void;
  onOpenEvent: (item: EventItem, e?: React.MouseEvent) => void;
  onQuickAdd: (event: EventItem) => void;
}

export default function ScheduleMonthView({
  lang, mainCalendarGridDays, activeFilteredList,
  dragOverDate, draggingId, onDragStart, onDragEnd,
  onDragOverDate, onDropDate, onOpenEvent, onQuickAdd,
}: Props) {
  const [quickAddDate,  setQuickAddDate]  = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim() || !quickAddDate) return;
    onQuickAdd({
      id: Date.now().toString(),
      title: quickAddTitle,
      subtitle: lang === 'zh' ? '快速记点日程' : 'Quick grid-created item',
      time: '10:00', date: quickAddDate,
      category: 'creative',
      location: lang === 'zh' ? '主设计工坊' : 'Atelier HQ Loft B',
      status: 'todo', completed: false,
    });
    setQuickAddTitle(''); setQuickAddDate(null);
  };

  return (
    <div className="bg-white border border-[#1A1A1A]/10 rounded-none overflow-hidden" id="month-grid-wrapper">

      {/* Day-of-week headers — 导航已上移至 ScheduleToolbar */}
      <div className="grid grid-cols-7 border-b border-[#1A1A1A]/10 text-center text-[10px] font-mono uppercase bg-neutral-50/30 text-neutral-500 py-2 select-none tracking-widest font-bold">
        {(lang === 'zh'
          ? ['周日 Sun','周一 Mon','周二 Tue','周三 Wed','周四 Thu','周五 Fri','周六 Sat']
          : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
        ).map(d => <div key={d}>{d}</div>)}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 auto-rows-fr border-t border-l border-[#1A1A1A]/10 bg-neutral-100/10 min-h-[550px]">
        {mainCalendarGridDays.map((cell, index) => {
          const dayEvents = activeFilteredList.filter(e => isEventOnDate(e, cell.dateString));
          return (
            <div
              key={index}
              onDragOver={e => onDragOverDate(e, cell.dateString)}
              onDrop={e => onDropDate(e, cell.dateString)}
              className={`border-r border-b border-[#1A1A1A]/10 p-2 min-h-[100px] transition-all flex flex-col justify-between ${
                cell.isCurrentMonth ? 'bg-white' : 'bg-neutral-100 text-neutral-300'
              } ${dragOverDate === cell.dateString ? 'bg-amber-500/15 ring-2 ring-[#1A1A1A] ring-inset' : ''}`}
            >
              {/* Day number + quick-add trigger */}
              <div className="flex items-center justify-between pointer-events-auto">
                <button
                  onClick={() => { setQuickAddDate(cell.dateString); setQuickAddTitle(''); }}
                  className="p-1 hover:bg-[#1A1A1A]/5 text-[9px] text-[#1A1A1A]/35 hover:text-[#1A1A1A] font-mono tracking-wider flex items-center gap-0.5 rounded-none"
                  title={lang === 'zh' ? '在这一天快捷新增记事' : 'Quick task on this date'}
                >
                  <Plus className="w-2.5 h-2.5" /><span>ADD</span>
                </button>
                <span className={`text-xs font-mono font-bold p-1 px-2 ${
                  cell.isToday ? 'bg-[#1A1A1A] text-[#F9F8F6] font-extrabold'
                  : cell.isCurrentMonth ? 'text-[#1A1A1A]' : 'text-neutral-300'
                }`}>
                  {cell.dayNum}
                </span>
              </div>

              {/* Events on this day */}
              <div className="flex-1 mt-1.5 space-y-[2px] overflow-y-auto max-h-[85px] scroller-hidden">
                {dayEvents.map(item => {
                  const catInfo = categoryMap[item.category] || categoryMap.creative;
                  const isCrossDay = item.endDate && item.endDate !== item.date;
                  let spanClass = '', roundedClass = 'rounded-none';
                  if (isCrossDay) {
                    if      (cell.dateString === item.date)    { spanClass = 'mr-[-10px] ml-0 border-r-0';   roundedClass = 'rounded-l-sm rounded-r-none'; }
                    else if (cell.dateString === item.endDate) { spanClass = 'ml-[-10px] mr-0 border-l-0';   roundedClass = 'rounded-r-sm rounded-l-none'; }
                    else                                       { spanClass = 'ml-[-10px] mr-[-10px] border-x-0'; roundedClass = 'rounded-none'; }
                  }
                  return (
                    <div
                      key={`${item.id}-${cell.dateString}`}
                      draggable
                      onDragStart={e => onDragStart(e, item.id)}
                      onDragEnd={onDragEnd}
                      onClick={e => onOpenEvent(item, e)}
                      className={`p-0.5 px-1 md:py-1 transition-all text-[9.5px] cursor-grab active:cursor-grabbing truncate font-mono select-none flex items-center justify-between ${
                        isCrossDay
                          ? `border-y ${catInfo.solidBg} ${spanClass} ${roundedClass}`
                          : `border-y border-r border-l-[3.5px] ${catInfo.pastelBg} ${catInfo.borderColor} rounded-none hover:bg-[#1A1A1A] hover:text-white`
                      }`}
                      title={`${item.time} - ${item.title}`}
                    >
                      <div className="flex items-center gap-1 truncate w-full">
                        <span className={`text-[8px] shrink-0 font-bold ${isCrossDay ? 'text-[#F9F8F6]/80' : 'text-[#1A1A1A]/50'}`}>
                          {isCrossDay ? '⇄' : item.time}
                        </span>
                        <span className={`truncate ${isCrossDay ? 'text-[#F9F8F6] font-bold' : ''}`}>{item.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Inline quick-add popover */}
              {quickAddDate === cell.dateString && (
                <div className="mt-2 p-1.5 border border-amber-900/40 bg-amber-50/5 text-left z-10 animate-scaleUp">
                  <form onSubmit={handleQuickSubmit} className="space-y-1.5">
                    <input type="text" required autoFocus
                      placeholder={lang === 'zh' ? '指令书写 (回车保存)' : 'Title... + ENTER'}
                      value={quickAddTitle} onChange={e => setQuickAddTitle(e.target.value)}
                      className="w-full text-[9px] p-1 bg-white border border-[#1A1A1A]/20 outline-none rounded-none" />
                    <div className="flex justify-between items-center text-[7.5px] font-mono uppercase tracking-widest text-neutral-400">
                      <span>PRESET: CREATIVE</span>
                      <button type="button" onClick={() => setQuickAddDate(null)} className="text-red-700 hover:underline">CLOSE</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
