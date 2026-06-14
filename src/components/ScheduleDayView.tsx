/**
 * ScheduleDayView — single-day event list with hour focus.
 */
import React from 'react';
import { Clock, MapPin } from 'lucide-react';
import { EventItem } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';
import { isEventOnDate } from '../hooks/useCalendarDays';

interface Props {
  lang: 'zh' | 'en';
  selectedDate: Date;
  todayString: string;
  activeFilteredList: EventItem[];
  onOpenEvent: (item: EventItem) => void;
}

export default function ScheduleDayView({
  lang, selectedDate, todayString, activeFilteredList,
  onOpenEvent,
}: Props) {
  const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const todayEvents = activeFilteredList
    .filter(e => isEventOnDate(e, dateKey))
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="bg-white border border-[#1A1A1A]/10 rounded-none overflow-hidden" id="day-timeline-wrapper">

      {/* Day content — 导航已上移至 ScheduleToolbar */}
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="pb-3 border-b border-[#1A1A1A]/10 flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-xl font-serif text-[#1A1A1A] font-bold italic uppercase tracking-tight">
              {selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <p className="text-(--fs-xs) font-mono text-[#1A1A1A]/50 uppercase tracking-widest">CHRONOS REGISTRY HOUR LOGS</p>
          </div>
          {dateKey === todayString && (
            <span className="bg-red-800 text-[#F9F8F6] px-2.5 py-0.5 font-mono text-(--fs-xs) font-bold uppercase tracking-widest animate-pulse">TODAY</span>
          )}
        </div>

        <div className="space-y-3">
          {todayEvents.length === 0 ? (
            <div className="p-12 border border-dashed border-[#1A1A1A]/15 max-w-lg mx-auto text-center space-y-2">
              <span className="text-xs font-serif italic text-neutral-400">
                {lang === 'zh' ? '这个特定日期暂无下发的信条或战略工作。' : 'Silence and solitude on this calendar index.'}
              </span>
              <p className="text-(--fs-xs) font-mono text-neutral-400 uppercase tracking-wider">
                {lang === 'zh' ? '点击侧边栏的 "+写新事件" 键以部署' : 'Use the "+ Bespoke Task" button to schedule something.'}
              </p>
            </div>
          ) : todayEvents.map((item, idx) => {
            const catInfo = categoryMap[item.category] || categoryMap.creative;
            const isRange = item.endDate && item.endDate !== item.date;
            return (
              <div key={idx} onClick={() => onOpenEvent(item)}
                className="p-4 border hover:border-[#1A1A1A]/30 transition bg-white shadow-sm flex items-start gap-4 cursor-pointer">
                <div className="text-center font-mono py-1 border-r border-[#1A1A1A]/10 pr-4 shrink-0 min-w-[70px]">
                  <p className="text-xs font-bold text-[#1A1A1A]/80 flex items-center gap-1 justify-center">
                    <Clock className="w-3.5 h-3.5 text-amber-800" /><span>{item.time}</span>
                  </p>
                  <span className="text-(--fs-2xs) text-neutral-400 uppercase tracking-wider block mt-1">
                    {isRange ? <span>{item.date.substring(5)} ~ {item.endDate!.substring(5)}</span> : item.date.substring(5)}
                  </span>
                </div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-(--fs-2xs) font-mono uppercase px-2 py-0.5 border ${catInfo.color}`}>
                      {lang === 'zh' ? catInfo.zhLabel : catInfo.enLabel}
                    </span>
                    <span className="text-neutral-400 text-xs font-mono">•</span>
                    <span className="text-(--fs-xs) text-[#1A1A1A]/60 font-mono tracking-widest uppercase flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /><span>{item.location}</span>
                    </span>
                  </div>
                  <h3 className="text-sm font-sans font-bold text-[#1A1A1A] leading-snug">{item.title}</h3>
                  <p className="text-xs font-serif italic text-[#1A1A1A]/60 leading-relaxed">{item.subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-(--fs-xs) font-mono px-2 py-0.5 border uppercase ${
                    item.status === 'done'     ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                    item.status === 'review'   ? 'bg-indigo-50 text-indigo-800 border-indigo-200'   :
                    item.status === 'progress' ? 'bg-amber-50 text-amber-800 border-amber-200'       :
                                                 'bg-zinc-100 text-zinc-700 border-zinc-200'
                  }`}>
                    {item.status.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
