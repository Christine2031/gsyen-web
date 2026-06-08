/**
 * ScheduleSidebar — left panel: mini calendar + category toggles.
 */
import React from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { EventItem } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';
import { isEventOnDate } from '../hooks/useCalendarDays';

interface MiniDay {
  dayNum: number;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
}

interface Props {
  lang: 'zh' | 'en';
  selectedDate: Date;
  events: EventItem[];
  miniCalendarDays: MiniDay[];
  visibleCategories: Record<string, boolean>;
  onSelectDate: (date: Date, dateStr: string) => void;
  onToggleCategory: (cat: string) => void;
  onSelectAllCategories: (on: boolean) => void;
  onNavigateDiff: (n: number) => void;
  onNavigateToday: () => void;
  onOpenAddForm: (dateStr?: string) => void;
}

export default function ScheduleSidebar({
  lang, selectedDate, events, miniCalendarDays, visibleCategories,
  onSelectDate, onToggleCategory, onSelectAllCategories,
  onNavigateDiff, onNavigateToday, onOpenAddForm,
}: Props) {
  return (
    <div className="space-y-6 flex flex-col min-w-[246px]">

      {/* A. Speed Dial "+ Create Event" */}
      <button
        onClick={() => onOpenAddForm(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`)}
        className="w-full py-2 bg-[#1A1A1A] text-white font-mono text-center hover:bg-[#2A2A2A] transition-all uppercase tracking-widest font-bold text-[10px] flex items-center justify-center gap-2 rounded-none"
      >
        <Plus className="w-3.5 h-3.5 text-amber-500" />
        <span>{lang === 'zh' ? '写新事件备忘' : 'Bespoke Task'}</span>
      </button>

      {/* B. Mini-month calendar */}
      <div className="space-y-2 border-t border-[#1A1A1A]/10 pt-4 text-center">
        <div className="flex items-center justify-between text-xs font-mono px-1">
          <span className="font-serif italic font-bold">
            {selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex gap-1.5">
            <button onClick={() => onNavigateDiff(-1)} className="p-0.5 hover:bg-[#1A1A1A]/5 rounded-none border border-neutral-200">
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button onClick={onNavigateToday} className="px-1.5 text-[8px] font-mono font-bold hover:bg-[#1A1A1A]/5 border border-neutral-200">
              T
            </button>
            <button onClick={() => onNavigateDiff(1)} className="p-0.5 hover:bg-[#1A1A1A]/5 rounded-none border border-neutral-200">
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 text-[8px] font-mono text-[#1A1A1A]/40 uppercase text-center font-bold">
          {(lang === 'zh' ? ['日','一','二','三','四','五','六'] : ['S','M','T','W','T','F','S']).map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {miniCalendarDays.map((cell, idx) => {
            const isSelected = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` === cell.dateString;
            return (
              <button
                key={idx}
                onClick={() => onSelectDate(new Date(cell.dateString), cell.dateString)}
                className={`py-1 text-[9px] font-mono transition-all text-center rounded-none relative ${
                  isSelected
                    ? 'bg-[#1A1A1A] text-white font-bold'
                    : cell.isToday
                      ? 'border border-[#1A1A1A] text-[#1A1A1A] font-bold bg-[#1A1A1A]/5'
                      : cell.isCurrentMonth
                        ? 'text-neutral-800 hover:bg-[#1A1A1A]/5'
                        : 'text-neutral-400/60 hover:bg-[#1A1A1A]/5'
                }`}
              >
                <span>{cell.dayNum}</span>
                {events.some(e => isEventOnDate(e, cell.dateString)) && !isSelected && (
                  <span className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-amber-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* C. My Calendars checkboxes */}
      <div className="space-y-3 border-t border-[#1A1A1A]/10 pt-4">
        <div className="flex items-center justify-between text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest">
          <span>{lang === 'zh' ? '书案分类目录' : 'MY CALENDARS'}</span>
          <div className="flex gap-2">
            <button onClick={() => onSelectAllCategories(true)} className="hover:text-[#1A1A1A] font-bold text-[8px]">
              {lang === 'zh' ? '全选' : 'ALL'}
            </button>
            <button onClick={() => onSelectAllCategories(false)} className="hover:text-red-800 font-bold text-[8px]">
              {lang === 'zh' ? '清除' : 'CLEAR'}
            </button>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          {Object.entries(categoryMap).map(([key, info]) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#1A1A1A]/5 p-1 px-1.5 transition select-none rounded-none text-[#1A1A1A]">
              <input type="checkbox" checked={visibleCategories[key] !== false}
                onChange={() => onToggleCategory(key)}
                className="w-3.5 h-3.5 accent-[#1A1A1A] border-neutral-300 rounded-none cursor-pointer" />
              <span className={`w-2 h-2 rounded-full ${info.dot}`} />
              <span className="font-mono text-[9px] uppercase tracking-wider flex-1">
                {lang === 'zh' ? info.zhLabel : info.enLabel}
              </span>
              <span className="text-[9px] font-mono text-neutral-400">
                ({events.filter(e => e.category === key).length})
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* D. Info box */}
      <div className="bg-[#F9F8F6] border border-dashed border-[#1A1A1A]/15 p-3 text-[10px] space-y-1 text-[#1A1A1A]/55 font-mono uppercase tracking-wide">
        <div className="font-serif italic font-bold text-[#1A1A1A] capitalize text-xs mb-1 tracking-normal">
          {lang === 'zh' ? '保密沙箱保障' : 'SANDBOX ISOLATION SECURE'}
        </div>
        <p className="text-[9px] leading-relaxed text-[#1A1A1A]/60">
          {lang === 'zh'
            ? '此排字月历运行于高可靠的客户端状态，所有日记录直接注入 indexDB，支持敏捷拖拽和无损离线。'
            : 'All calendars run strictly in a sandboxed runtime. Draggable elements automatically re-write dates in compliance.'}
        </p>
      </div>
    </div>
  );
}
