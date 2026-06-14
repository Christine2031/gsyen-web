// ScheduleModule 的工具栏（单例 UI 外壳，从协调器拆出以保持精简）。
// 布局参考 Google Calendar：主操作 + 今天/翻页/日期标题左置，视图切换 / 搜索归右。
import { useEffect, useRef, useState } from 'react';
import { Plus, Search, X, PanelLeft, ChevronLeft, ChevronRight } from 'lucide-react';

export type ViewMode = 'month' | 'week' | 'day';

interface ToolbarProps {
  lang: 'zh' | 'en';
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  searchText: string;
  setSearchText: (s: string) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (fn: (o: boolean) => boolean) => void;
  showAddForm: boolean;
  setShowAddForm: (fn: (o: boolean) => boolean) => void;
  onClearAll: () => void;
  total: number;
  active: number;
  selectedDate: Date;
  onNavigateToday: () => void;
  onNavigate: (n: number) => void;
}

export function ScheduleToolbar(p: ToolbarProps) {
  const { lang } = p;
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  const dateLabel = p.viewMode === 'day'
    ? p.selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : p.selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' });
  return (
    <div className="w-full flex flex-row items-center justify-between gap-3 flex-nowrap">
      {/* 左：目录开关 + 签发事件 + 今天 / 翻页 / 日期标题（Google Calendar 惯例） */}
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={() => p.setIsSidebarOpen(o => !o)}
          className={`p-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all flex items-center justify-center ${p.isSidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'bg-transparent text-[#1A1A1A]/70'}`}>
          <PanelLeft className="w-4 h-4" />
        </button>
        <button onClick={() => p.setShowAddForm(o => !o)}
          className={`px-4 py-1.5 font-bold text-(--fs-sm) font-mono tracking-widest uppercase transition-all flex items-center gap-2 rounded-none ${p.showAddForm ? 'bg-red-800 text-white hover:bg-red-900' : 'bg-[#1A1A1A] text-white hover:bg-[#2C2C2C]'}`}>
          {p.showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{p.showAddForm ? (lang === 'zh' ? '收回表单' : 'Collapse Scribe') : (lang === 'zh' ? '签发事件' : 'Sealed Event')}</span>
        </button>
        <button onClick={p.onNavigateToday}
          className="px-3.5 py-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition text-(--fs-sm) font-mono font-bold tracking-widest uppercase rounded-none">
          {lang === 'zh' ? '今天' : 'Today'}
        </button>
        <div className="flex items-center">
          <button onClick={() => p.onNavigate(-1)} className="p-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => p.onNavigate(1)} className="p-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <h3 className="text-sm font-serif font-bold tracking-tight italic whitespace-nowrap">{dateLabel}</h3>
      </div>

      {/* 右：统计 + 视图切换 + 分流筛选 + 搜索 + 清空 */}
      <div className="flex items-center gap-3 flex-nowrap min-w-0">
        <div className="hidden sm:flex gap-3 items-center px-3 py-1 border border-[#1A1A1A]/10 text-(--fs-xs) font-mono text-[#1A1A1A]/70 uppercase tracking-widest rounded-none">
          <div>{lang === 'zh' ? '总日程:' : 'TOTAL:'} <strong className="text-amber-800 font-bold">{p.total}</strong></div>
          <div className="w-[1px] h-3 bg-[#1A1A1A]/10" />
          <div>{lang === 'zh' ? '筛选:' : 'SHOWN:'} <strong className="text-[#1A1A1A]">{p.active}</strong></div>
        </div>
        <div className="flex items-center gap-1 border border-[#1A1A1A]/10 p-1 bg-[#F9F8F6]/40">
          {(['month','week','day'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => p.setViewMode(mode)}
              className={`px-3.5 py-1.5 text-(--fs-sm) font-mono font-bold uppercase tracking-widest transition-all rounded-none ${p.viewMode === mode ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'}`}>
              {mode === 'month' ? (lang === 'zh' ? '格网月历' : 'Month Grid')
                : mode === 'week' ? (lang === 'zh' ? '执行周历' : 'Week Timeline')
                :                  (lang === 'zh' ? '单日重点' : 'Day Focus')}
            </button>
          ))}
        </div>
        {/* Google 式搜索：平时只有放大镜，点击展开 */}
        <div className="flex items-center">
          <button onClick={() => setSearchOpen(o => !o)}
            className="p-1.5 hover:bg-[#1A1A1A]/5 text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition rounded-none"
            title={lang === 'zh' ? '搜索' : 'Search'}>
            <Search className="w-4 h-4" />
          </button>
          <input ref={searchRef} type="text"
            placeholder={lang === 'zh' ? '搜索文书卡片...' : 'Filter schedule archives...'}
            value={p.searchText} onChange={e => p.setSearchText(e.target.value)}
            onBlur={() => { if (!p.searchText) setSearchOpen(false); }}
            className={`transition-all duration-300 ease-out text-xs rounded-none bg-transparent focus:outline-none text-[#1A1A1A] ${
              searchOpen
                ? 'w-52 opacity-100 px-3 py-1.5 border-b border-[#1A1A1A]/30 focus:border-[#1A1A1A]'
                : 'w-0 opacity-0 p-0 border-0 pointer-events-none'
            }`} />
        </div>
        <button onClick={p.onClearAll}
          className="px-3 py-1.5 font-mono text-(--fs-xs) tracking-widest uppercase border border-red-200 text-red-700 hover:bg-red-50 transition-all rounded-none">
          {lang === 'zh' ? '清空' : 'CLEAR ALL'}
        </button>
      </div>
    </div>
  );
}
