/**
 * ScheduleEventModal — event detail + inline edit dialog.
 * All edit-field state is self-contained; parent receives final changes via onSave.
 */
import React, { useState } from 'react';
import { Clock, MapPin, X, Edit2, Info } from 'lucide-react';
import { EventItem, ColumnId, EventCategory } from '../types/schedule';
import { categoryMap } from '../config/scheduleConfig';

interface Props {
  lang: 'zh' | 'en';
  event: EventItem;
  onClose: () => void;
  onSave: (id: string, changes: Partial<EventItem>) => void;
  onDelete: (id: string) => void;
}

export default function ScheduleEventModal({ lang, event, onClose, onSave, onDelete }: Props) {
  const [editing,  setEditing]  = useState(false);
  const [title,    setTitle]    = useState(event.title);
  const [subtitle, setSubtitle] = useState(event.subtitle);
  const [time,     setTime]     = useState(event.time);
  const [date,     setDate]     = useState(event.date);
  const [endDate,  setEndDate]  = useState(event.endDate || event.date);
  const [category, setCategory] = useState<EventCategory>(event.category);
  const [location, setLocation] = useState(event.location);
  const [status,   setStatus]   = useState<ColumnId>(event.status);

  const catInfo = categoryMap[event.category];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(event.id, { title, subtitle, time, date, endDate: endDate || date, category, location, status, completed: status === 'done' });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#1A1A1A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white border-2 border-[#1A1A1A] max-w-lg w-full p-6 space-y-4 shadow-xl relative animate-scaleUp">

        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
          <span className="text-(--fs-xs) font-mono text-neutral-400 uppercase tracking-widest flex items-center gap-1">
            <Info className="w-3 h-3" />
            <span>CHRONOS MANUSCRIPT RECORD : {event.id}</span>
          </span>
          <button onClick={onClose} className="p-1 hover:bg-[#1A1A1A]/5 rounded-none text-neutral-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View mode */}
        {!editing ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-(--fs-2xs) font-mono uppercase px-2 py-0.5 border ${catInfo.color}`}>
                  {lang === 'zh' ? catInfo.zhLabel : catInfo.enLabel}
                </span>
                <span className={`text-(--fs-2xs) font-mono uppercase px-2 py-0.5 border ${
                  event.status === 'done'     ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                  event.status === 'review'   ? 'bg-indigo-50 text-indigo-800 border-indigo-200'   :
                  event.status === 'progress' ? 'bg-amber-50 text-amber-800 border-amber-200'       :
                                                'bg-zinc-100 text-zinc-700 border-zinc-200'
                }`}>
                  {event.status.toUpperCase()}
                </span>
              </div>
              <h3 className="text-base font-sans font-bold text-[#1A1A1A] leading-snug">{event.title}</h3>
              <p className="text-xs font-serif italic text-neutral-500 leading-relaxed">{event.subtitle}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F9F8F6] p-3 border border-[#1A1A1A]/10 font-mono text-neutral-600">
              <div className="space-y-1">
                <p className="text-(--fs-2xs) text-neutral-400 uppercase tracking-widest">{lang === 'zh' ? '日程期间' : 'DATE RANGE'}</p>
                <p className="font-bold text-[#1A1A1A]">
                  {event.endDate && event.endDate !== event.date
                    ? <span>{event.date} {lang === 'zh' ? '至' : 'to'} {event.endDate}</span>
                    : event.date}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-(--fs-2xs) text-neutral-400 uppercase tracking-widest">{lang === 'zh' ? '精确时刻' : 'SCHED TIMELINE'}</p>
                <p className="font-bold text-[#1A1A1A] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /><span>{event.time}</span>
                </p>
              </div>
              <div className="space-y-1 col-span-2 mt-1 pt-1.5 border-t border-neutral-200/50">
                <p className="text-(--fs-2xs) text-neutral-400 uppercase tracking-widest">{lang === 'zh' ? '保密地址保密节点' : 'VENUE LOCATION'}</p>
                <p className="font-bold text-[#1A1A1A] flex items-center gap-1 truncate">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{event.location}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-neutral-100">
              <button type="button" onClick={() => onDelete(event.id)}
                className="px-4 py-1.5 bg-red-50 text-red-800 hover:bg-red-100 border border-red-200 text-(--fs-sm) font-mono uppercase tracking-widest rounded-none">
                {lang === 'zh' ? '销毁日程' : 'Delete'}
              </button>
              <button type="button" onClick={() => setEditing(true)}
                className="px-4 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#2C2C2C] text-(--fs-sm) font-mono uppercase tracking-widest flex items-center gap-1.5 rounded-none">
                <Edit2 className="w-3 h-3" /><span>{lang === 'zh' ? '修改编纂' : 'Revise'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Edit mode */
          <form onSubmit={handleSave} className="space-y-3.5">
            <div>
              <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '标题' : 'TITLE'}</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-xs p-2 border border-[#1A1A1A]/15 rounded-none outline-none focus:border-[#1A1A1A]" />
            </div>
            <div>
              <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '内容' : 'SUBTITLE'}</label>
              <textarea value={subtitle} onChange={e => setSubtitle(e.target.value)}
                className="w-full text-xs p-2 border border-[#1A1A1A]/15 rounded-none outline-none focus:border-[#1A1A1A] h-16" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '起始日期' : 'START DATE'}</label>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                  className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none font-mono" />
              </div>
              <div>
                <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '结束日期' : 'END DATE'}</label>
                <input type="date" required value={endDate} min={date} onChange={e => setEndDate(e.target.value)}
                  className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none font-mono" />
              </div>
              <div>
                <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '时间' : 'TIME'}</label>
                <input type="time" required value={time} onChange={e => setTime(e.target.value)}
                  className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '分类' : 'CATEGORY'}</label>
                <select value={category} onChange={e => setCategory(e.target.value as EventCategory)}
                  className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none">
                  <option value="creative">{lang === 'zh' ? '创意与排版' : 'Creative & Design'}</option>
                  <option value="finance">{lang === 'zh' ? '资产与发票' : 'Capital & Flows'}</option>
                  <option value="secure">{lang === 'zh' ? '保密机制' : 'Citadel Security'}</option>
                  <option value="strategy">{lang === 'zh' ? '战略圆桌会议' : 'Strategic'}</option>
                </select>
              </div>
              <div>
                <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '执行阶段' : 'STAGE'}</label>
                <select value={status} onChange={e => setStatus(e.target.value as ColumnId)}
                  className="w-full text-xs p-1.5 border border-[#1A1A1A]/15 rounded-none">
                  <option value="todo">TODO</option>
                  <option value="progress">PROGRESS</option>
                  <option value="review">REVIEW</option>
                  <option value="done">COMPLETED</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-(--fs-2xs) font-mono uppercase text-neutral-400 mb-1">{lang === 'zh' ? '会场场所' : 'LOCATION'}</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className="w-full text-xs p-2 border border-[#1A1A1A]/15 rounded-none" />
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-neutral-100">
              <button type="button" onClick={() => setEditing(false)}
                className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 text-(--fs-sm) font-mono uppercase tracking-widest rounded-none">
                {lang === 'zh' ? '返回详情' : 'Back'}
              </button>
              <button type="submit"
                className="px-5 py-1.5 bg-[#1A1A1A] text-white hover:bg-[#2C2C2C] text-(--fs-sm) font-mono uppercase tracking-widest rounded-none">
                {lang === 'zh' ? '确认保存变动' : 'Save revision'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
