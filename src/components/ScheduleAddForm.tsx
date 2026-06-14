/**
 * ScheduleAddForm — self-contained add-event drawer.
 * All form state lives here; parent only receives the finished EventItem.
 */
import React, { useState, useEffect } from 'react';
import { Plus, X, Sparkles } from 'lucide-react';
import { EventItem, ColumnId, EventCategory } from '../types/schedule';
import { KanbanColumn } from '../stores/kanbanColumnStore';

const FALLBACK_COLUMNS: KanbanColumn[] = [
  { id: 'todo',     title: '预约待编' },
  { id: 'progress', title: '执行中柜' },
  { id: 'review',   title: '评审阶段' },
  { id: 'done',     title: '极速已成' },
];

interface Props {
  lang: 'zh' | 'en';
  todayString: string;
  initialStatus?: ColumnId;
  initialDate?: string;
  columns?: KanbanColumn[];   // 动态列；不传则用默认 4 列
  onAdd: (event: EventItem) => void;
  onClose: () => void;
}

export default function ScheduleAddForm({ lang, todayString, initialStatus = 'todo', initialDate, columns, onAdd, onClose }: Props) {
  const colOptions = columns ?? FALLBACK_COLUMNS;
  const [title,    setTitle]    = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [time,     setTime]     = useState('10:00');
  const [date,     setDate]     = useState(initialDate ?? todayString);
  const [endDate,  setEndDate]  = useState(initialDate ?? todayString);
  const [category, setCategory] = useState<EventCategory>('creative');
  const [location, setLocation] = useState('');
  const [status,   setStatus]   = useState<ColumnId>(initialStatus);

  // Auto-sync end date when start date changes
  useEffect(() => { if (date) setEndDate(date); }, [date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: Date.now().toString(),
      title,
      subtitle: subtitle || (lang === 'zh' ? '自主拟定日程项目' : 'Self-defined agenda block'),
      time: time || '12:00',
      date: date || todayString,
      endDate: endDate || date || todayString,
      category,
      location: location || (lang === 'zh' ? '总部工作坊' : 'Atelier Headquarters'),
      status,
      completed: status === 'done',
    });
    onClose();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-[#1A1A1A] p-6 space-y-4 max-w-4xl mx-auto shadow-sm animate-fadeIn"
    >
      <div className="pb-3 border-b border-[#1A1A1A]/10 flex items-center justify-between">
        <h3 className="text-xs font-serif tracking-widest text-[#1A1A1A] font-bold uppercase flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          <span>{lang === 'zh' ? '极速日程信条拟书契约' : 'ATELIER MEMORANDUM DEPLOYMENT ENGINE'}</span>
        </h3>
        <span className="text-(--fs-xs) font-mono text-[#1A1A1A]/40 uppercase tracking-widest">
          LANE PRESET: {status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Title */}
        <div>
          <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
            {lang === 'zh' ? '日程核心标题 (简述)' : 'Primary Event Title'}
          </label>
          <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Atelier Brand Typography Scribe"
            className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]" />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
            {lang === 'zh' ? '实施大纲或行动意图 (选填)' : 'Strategic Intent (Optional)'}
          </label>
          <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
            placeholder="e.g. Confirm geometric serif spacing constraints at 400dpi"
            className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none focus:outline-none" />
        </div>

        {/* Date / End Date / Time */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '起始日期' : 'Start Date'}
            </label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none font-mono" />
          </div>
          <div>
            <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '结束日期' : 'End Date (Optional)'}
            </label>
            <input type="date" required value={endDate} min={date} onChange={e => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none font-mono" />
          </div>
          <div>
            <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '计划时间' : 'Exact Timeline'}
            </label>
            <input type="time" required value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none font-mono" />
          </div>
        </div>

        {/* Category / Status */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '分流领域' : 'Category Domain'}
            </label>
            <select value={category} onChange={e => setCategory(e.target.value as EventCategory)}
              className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-neutral-800">
              <option value="creative">{lang === 'zh' ? '创意与排版' : 'Creative & Design'}</option>
              <option value="finance">{lang === 'zh' ? '资产与发票' : 'Capital & Flows'}</option>
              <option value="secure">{lang === 'zh' ? '机密级安全' : 'Citadel Security'}</option>
              <option value="strategy">{lang === 'zh' ? '战略发展' : 'Strategic Roadmap'}</option>
            </select>
          </div>
          <div>
            <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '投放看板分类段' : 'Initial Status'}
            </label>
            <select value={status} onChange={e => setStatus(e.target.value as ColumnId)}
              className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-neutral-800">
              {colOptions.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Location */}
        <div className="md:col-span-2">
          <label className="block text-(--fs-xs) tracking-[0.12em] font-mono text-[#1A1A1A]/60 uppercase mb-1">
            {lang === 'zh' ? '指定研讨保密节点/场所' : 'Secure Vault Node or Venue'}
          </label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Secure PGP Ledger Vault III / Studio Loft C"
            className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-[#1A1A1A]/10 mt-3">
        <button type="button" onClick={onClose}
          className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] font-mono text-(--fs-xs) uppercase tracking-widest rounded-none">
          {lang === 'zh' ? '取消起草' : 'Cancel'}
        </button>
        <button type="submit"
          className="px-5 py-2 bg-[#1A1A1A] text-[#F9F8F6] font-mono font-bold text-(--fs-xs) uppercase tracking-widest rounded-none">
          {lang === 'zh' ? '密封下发执行' : 'Seal and Dispatch'}
        </button>
      </div>
    </form>
  );
}
