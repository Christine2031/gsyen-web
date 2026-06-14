/**
 * ScheduleWeekView — 7-column week timeline with drag-drop.
 */
import React from 'react';
import { Clock } from 'lucide-react';
import { EventItem } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';
import { isEventOnDate } from '../hooks/useCalendarDays';

interface WeekDay {
  label: string; dayNum: number; dateString: string; isToday: boolean;
}

interface Props {
  lang: 'zh' | 'en';
  currentWeekDaysList: WeekDay[];
  activeFilteredList: EventItem[];
  dragOverDate: string | null;
  draggingId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOverDate: (e: React.DragEvent, dateStr: string) => void;
  onDropDate: (e: React.DragEvent, dateStr: string) => void;
  onOpenEvent: (item: EventItem) => void;
}

export default function ScheduleWeekView({
  lang, currentWeekDaysList, activeFilteredList,
  dragOverDate, draggingId, onDragStart, onDragEnd,
  onDragOverDate, onDropDate, onOpenEvent,
}: Props) {
  return (
    <div className="bg-white border border-[#1A1A1A]/10 rounded-none overflow-hidden" id="week-timeline-wrapper">

      {/* 7 columns — 导航已上移至 ScheduleToolbar */}
      <div className="grid grid-cols-1 md:grid-cols-7 border-b border-[#1A1A1A]/10">
        {currentWeekDaysList.map((day, idx) => {
          const dayEventsList = activeFilteredList.filter(e => isEventOnDate(e, day.dateString));
          return (
            <div
              key={idx}
              onDragOver={e => onDragOverDate(e, day.dateString)}
              onDrop={e => onDropDate(e, day.dateString)}
              className={`border-r last:border-r-0 border-[#1A1A1A]/10 min-h-[450px] flex flex-col p-3 bg-white ${
                day.isToday ? 'bg-[#1A1A1A]/5 shadow-inner' : ''
              } ${dragOverDate === day.dateString ? 'bg-amber-500/10' : ''}`}
            >
              {/* Day header */}
              <div className="pb-2 border-b border-dashed border-[#1A1A1A]/10 flex items-center justify-between">
                <span className="text-(--fs-xs) font-mono text-neutral-400 uppercase tracking-widest">{day.label}</span>
                <span className={`text-xs font-mono font-bold w-6 h-6 flex items-center justify-center ${
                  day.isToday ? 'bg-[#1A1A1A] text-[#F9F8F6] rounded-none' : 'text-[#1A1A1A]'
                }`}>
                  {day.dayNum}
                </span>
              </div>

              {/* Events */}
              <div className="flex-1 mt-3 space-y-[3px] overflow-y-auto max-h-[400px]">
                {dayEventsList.length === 0 ? (
                  <div className="h-32 border border-dashed border-[#1A1A1A]/10 flex items-center justify-center p-2 text-center">
                    <span className="text-(--fs-2xs) font-mono text-neutral-400 uppercase tracking-wider">
                      {lang === 'zh' ? '暂无安排' : 'EMPTY CELL'}
                    </span>
                  </div>
                ) : dayEventsList.map(item => {
                  const catInfo = categoryMap[item.category] || categoryMap.creative;
                  const isCrossDay = item.endDate && item.endDate !== item.date;
                  return (
                    <div
                      key={`${item.id}-${day.dateString}`}
                      draggable
                      onDragStart={e => onDragStart(e, item.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => onOpenEvent(item)}
                      className={`p-2.5 transition-all text-left text-(--fs-sm) cursor-grab active:cursor-grabbing space-y-1 rounded-none shadow-xs ${
                        isCrossDay
                          ? `border ${catInfo.solidBg}`
                          : `border-y border-r border-l-[4px] ${catInfo.pastelBg} ${catInfo.borderColor} hover:bg-[#1A1A1A] hover:text-[#F9F8F6]`
                      }`}
                    >
                      <div className="flex items-center justify-between text-(--fs-2xs) font-mono uppercase tracking-wider">
                        <span className={`flex items-center gap-1 ${isCrossDay ? 'text-[#F9F8F6]/85' : 'text-neutral-400'}`}>
                          <Clock className="w-2.5 h-2.5 text-[#1A1A1A]/50" />{item.time}
                        </span>
                        <span className={isCrossDay ? 'text-[#F9F8F6]/90 font-bold' : catInfo.textAccent}>
                          {item.category.toUpperCase()}
                        </span>
                      </div>
                      <h4 className={`font-bold leading-tight font-sans truncate ${isCrossDay ? 'text-[#F9F8F6]' : 'text-neutral-800'}`}>{item.title}</h4>
                      <p className={`text-[8.5px] italic truncate ${isCrossDay ? 'text-[#F9F8F6]/75' : 'text-[#1A1A1A]/50'}`}>{item.location}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
