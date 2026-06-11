// ScheduleModule 的工具栏（单例 UI 外壳，从协调器拆出以保持精简）。
// 布局参考 Google Calendar：主操作左置贴目录开关，视图切换 / 筛选 / 搜索归右。
import { Plus, Search, X, PanelLeft } from 'lucide-react';

export type ViewMode = 'month' | 'week' | 'day';

interface ToolbarProps {
  lang: 'zh' | 'en';
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  searchText: string;
  setSearchText: (s: string) => void;
  filterCategory: string;
  setFilterCategory: (c: string) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (fn: (o: boolean) => boolean) => void;
  showAddForm: boolean;
  setShowAddForm: (fn: (o: boolean) => boolean) => void;
  onClearAll: () => void;
  total: number;
  active: number;
}

export function ScheduleToolbar(p: ToolbarProps) {
  const { lang } = p;
  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-3 flex flex-col xl:flex-row items-center justify-between gap-4">
      {/* 左：目录开关 + 签发事件（主操作，Gmail Compose 惯例） */}
      <div className="flex items-center gap-3 w-full xl:w-auto">
        <button onClick={() => p.setIsSidebarOpen(o => !o)}
          className={`p-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all flex items-center justify-center ${p.isSidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'bg-transparent text-[#1A1A1A]/70'}`}>
          <PanelLeft className="w-4 h-4" />
        </button>
        <button onClick={() => p.setShowAddForm(o => !o)}
          className={`px-4 py-1.5 font-bold text-[10px] font-mono tracking-widest uppercase transition-all flex items-center gap-2 rounded-none ${p.showAddForm ? 'bg-red-800 text-white hover:bg-red-900' : 'bg-[#1A1A1A] text-white hover:bg-[#2C2C2C]'}`}>
          {p.showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{p.showAddForm ? (lang === 'zh' ? '收回表单' : 'Collapse Scribe') : (lang === 'zh' ? '签发事件' : 'Sealed Event')}</span>
        </button>
      </div>

      {/* 右：统计 + 视图切换 + 分流筛选 + 搜索 + 清空 */}
      <div className="flex items-center justify-end w-full xl:w-auto gap-3 flex-wrap">
        <div className="hidden sm:flex gap-3 items-center px-3 py-1 border border-[#1A1A1A]/10 text-[9px] font-mono text-[#1A1A1A]/70 uppercase tracking-widest rounded-none">
          <div>{lang === 'zh' ? '总日程:' : 'TOTAL:'} <strong className="text-amber-800 font-bold">{p.total}</strong></div>
          <div className="w-[1px] h-3 bg-[#1A1A1A]/10" />
          <div>{lang === 'zh' ? '筛选:' : 'SHOWN:'} <strong className="text-[#1A1A1A]">{p.active}</strong></div>
        </div>
        <div className="flex items-center gap-1 border border-[#1A1A1A]/10 p-1 bg-[#F9F8F6]/40">
          {(['month','week','day'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => p.setViewMode(mode)}
              className={`p-1.5 px-3.5 text-[9px] font-mono uppercase tracking-wider transition-all rounded-none ${p.viewMode === mode ? 'bg-[#1A1A1A] text-white font-bold' : 'text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5'}`}>
              {mode === 'month' ? (lang === 'zh' ? '格网月历' : 'Month Grid')
                : mode === 'week' ? (lang === 'zh' ? '执行周历' : 'Week Timeline')
                :                  (lang === 'zh' ? '单日重点' : 'Day Focus')}
            </button>
          ))}
        </div>
        <select value={p.filterCategory} onChange={e => p.setFilterCategory(e.target.value)}
          className="p-1 px-3 py-1.5 border border-[#1A1A1A]/10 rounded-none text-[10px] font-mono uppercase tracking-wider bg-transparent text-[#1A1A1A] cursor-pointer">
          <option value="all">■ {lang === 'zh' ? '全领域分流' : 'ALL CATEGORIES'}</option>
          <option value="creative">{lang === 'zh' ? '创意与排版' : 'CREATIVE & DESIGN'}</option>
          <option value="finance">{lang === 'zh' ? '资产与发票' : 'CAPITAL & FLOWS'}</option>
          <option value="secure">{lang === 'zh' ? '保密机制' : 'SECURITY SCHEMES'}</option>
          <option value="strategy">{lang === 'zh' ? '战略圆桌' : 'STRATEGIC ROUND'}</option>
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#1A1A1A]/40" />
          <input type="text" placeholder={lang === 'zh' ? '搜索文书卡片...' : 'Filter schedule archives...'}
            value={p.searchText} onChange={e => p.setSearchText(e.target.value)}
            className="w-44 xl:w-56 pl-9 pr-4 py-1.5 text-xs border border-[#1A1A1A]/10 rounded-none bg-[#F9F8F6]/40 focus:bg-white focus:outline-none focus:border-[#1A1A1A]/40 transition-colors text-[#1A1A1A]" />
        </div>
        <button onClick={p.onClearAll}
          className="px-3 py-1.5 font-mono text-[9px] tracking-widest uppercase border border-red-200 text-red-700 hover:bg-red-50 transition-all rounded-none">
          {lang === 'zh' ? '清空' : 'CLEAR ALL'}
        </button>
      </div>
    </div>
  );
}
