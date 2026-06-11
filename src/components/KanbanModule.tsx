/**
 * KanbanModule — 动态多列看板
 * 列数据持久化在 kanbanColumnStore（localStorage）。
 * 卡片数据与 ScheduleModule 共享 scheduleStore。
 */
import React, { useState, useEffect } from 'react';
import { CheckCircle2, Plus, Search, X } from 'lucide-react';
import { KanbanIcon } from '../gsyen-designer';

import { EventItem, ColumnId } from '../types/schedule';
import { DEFAULT_EVENTS }       from '../config/scheduleConfig';
import { useScheduleEvents }    from '../hooks/useScheduleEvents';
import { scheduleStore }        from '../stores/scheduleStore';
import { useDragDrop }          from '../hooks/useDragDrop';
import { kanbanColumnStore, KanbanColumn } from '../stores/kanbanColumnStore';
import { ScheduleFooter }       from './ScheduleChrome';

import ScheduleAddForm    from './ScheduleAddForm';
import ScheduleKanbanView from './ScheduleKanbanView';
import ScheduleEventModal from './ScheduleEventModal';

interface KanbanModuleProps { lang: 'zh' | 'en'; }

export default function KanbanModule({ lang }: KanbanModuleProps) {
  const todayDate   = new Date();
  const todayString = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;

  // ── 列状态 ────────────────────────────────────────────────────────────────
  const [columns, setColumns] = useState<KanbanColumn[]>(() => kanbanColumnStore.getAll());

  useEffect(() => {
    const sync = () => setColumns(kanbanColumnStore.getAll());
    window.addEventListener('kanban-columns-updated', sync);
    return () => window.removeEventListener('kanban-columns-updated', sync);
  }, []);

  // ── 卡片状态 ──────────────────────────────────────────────────────────────
  const [filterCategory,       setFilterCategory]       = useState('all');
  const [searchText,           setSearchText]           = useState('');
  const [showAddForm,          setShowAddForm]          = useState(false);
  const [addFormInitialStatus, setAddFormInitialStatus] = useState<ColumnId>('todo');
  const [selectedEventForView, setSelectedEventForView] = useState<EventItem | null>(null);
  const [notification,         setNotification]         = useState<string | null>(null);

  const { events, addEvent, updateEvent, removeEvent, changeStatus } = useScheduleEvents(DEFAULT_EVENTS);
  const { draggingId, dragOverColumn, onDragStart, onDragEnd, onDragOverColumn, onDropColumn } = useDragDrop();

  const notify = (text: string) => {
    setNotification(text);
    setTimeout(() => setNotification(null), 3500);
  };

  const activeFilteredList = events.filter(item => {
    const matchSearch   = item.title.toLowerCase().includes(searchText.toLowerCase()) ||
                          item.subtitle.toLowerCase().includes(searchText.toLowerCase());
    const matchCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchSearch && matchCategory;
  });

  // ── 列操作 ────────────────────────────────────────────────────────────────
  const handleAddColumn = (title: string) => {
    kanbanColumnStore.add(title);
  };

  const handleRenameColumn = (id: string, title: string) => {
    kanbanColumnStore.rename(id, title);
  };

  const handleDeleteColumn = (id: string) => {
    if (columns.length <= 1) return;
    const fallback = columns.find(c => c.id !== id)?.id ?? '';
    events.filter(e => (e.status || 'todo') === id).forEach(e => changeStatus(e.id, fallback));
    kanbanColumnStore.remove(id);
  };

  // ── 卡片操作 ──────────────────────────────────────────────────────────────
  const openAddForm = (status: ColumnId = columns[0]?.id ?? 'todo') => {
    setAddFormInitialStatus(status);
    setShowAddForm(true);
  };

  const handleAddEvent = (event: EventItem) => {
    addEvent(event);
    notify(lang === 'zh' ? `Deploy 成功: ${event.title}` : `Card deployed: ${event.title}`);
  };

  const handleDeleteEvent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = events.find(ev => ev.id === id);
    removeEvent(id);
    if (selectedEventForView?.id === id) setSelectedEventForView(null);
    notify(lang === 'zh' ? `丢弃卡片: ${item?.title}` : `Card purged: ${item?.title}`);
  };

  const handleClearAll = () => {
    if (!window.confirm(lang === 'zh' ? '清空全部卡片？此操作不可撤销。' : 'Clear all cards? Cannot be undone.')) return;
    scheduleStore.clearAll();
    window.dispatchEvent(new CustomEvent('schedule-updated'));
    setSelectedEventForView(null);
    notify(lang === 'zh' ? '已清空' : 'Cleared');
  };

  const handleDropColumn = (e: React.DragEvent, targetStatus: ColumnId) => {
    const id = onDropColumn(e);
    if (id) {
      changeStatus(id, targetStatus);
      notify(lang === 'zh' ? `已移至 ${targetStatus}` : `Moved to ${targetStatus}`);
    }
  };

  const handleShiftCard = (id: string, dir: 'back' | 'forward', e: React.MouseEvent) => {
    e.stopPropagation();
    const colIds = columns.map(c => c.id);
    const ev = events.find(item => item.id === id);
    if (!ev) return;
    const cur = colIds.indexOf(ev.status || colIds[0]);
    const nxt = dir === 'forward' ? Math.min(cur + 1, colIds.length - 1) : Math.max(cur - 1, 0);
    if (nxt !== cur) changeStatus(id, colIds[nxt]);
  };

  const handleSaveEvent = (id: string, changes: Partial<EventItem>) => {
    updateEvent(id, changes);
    notify(lang === 'zh' ? '已保存' : 'Saved');
  };

  return (
    <div className="flex flex-col h-full text-[#1A1A1A] font-sans animate-fadeIn">

      {notification && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 border border-amber-900/40 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-bounce" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header + 工具栏 + 表单 — shrink-0 */}
      <div className="shrink-0 px-8 pt-8 pb-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif text-[#1A1A1A] font-bold tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-[#1A1A1A] text-white"><KanbanIcon className="w-4 h-4" /></span>
            <span>{lang === 'zh' ? '项目看板' : 'Project Board'}</span>
          </h2>
          <p className="text-xs text-[#1A1A1A]/40 font-mono uppercase tracking-widest mt-1">
            {columns.length} {lang === 'zh' ? '列' : 'lists'} · {events.length} {lang === 'zh' ? '卡片' : 'cards'}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#1A1A1A]/40" />
            <input type="text" placeholder={lang === 'zh' ? '搜索卡片…' : 'Search cards…'}
              value={searchText} onChange={e => setSearchText(e.target.value)}
              className="w-48 pl-9 pr-4 py-1.5 text-xs border border-[#1A1A1A]/10 bg-[#F9F8F6]/40 focus:bg-white focus:outline-none focus:border-[#1A1A1A]/40 transition-colors" />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="p-1.5 px-2 border border-[#1A1A1A]/10 text-xs font-mono uppercase tracking-wider bg-transparent text-[#1A1A1A] cursor-pointer">
            <option value="all">■ {lang === 'zh' ? '全部' : 'All'}</option>
            <option value="creative">{lang === 'zh' ? '创意' : 'Creative'}</option>
            <option value="finance">{lang === 'zh' ? '资产' : 'Finance'}</option>
            <option value="secure">{lang === 'zh' ? '保密' : 'Secure'}</option>
            <option value="strategy">{lang === 'zh' ? '战略' : 'Strategy'}</option>
          </select>
          <button onClick={handleClearAll}
            className="px-3 py-1.5 text-[9px] font-mono tracking-widest uppercase border border-red-200 text-red-700 hover:bg-red-50 transition-all">
            {lang === 'zh' ? '清空' : 'Clear'}
          </button>
          <button onClick={() => openAddForm()}
            className="px-4 py-1.5 bg-[#1A1A1A] text-[#F9F8F6] text-[10px] font-bold font-mono tracking-widest uppercase flex items-center gap-1.5 hover:bg-[#1A1A1A]/80 transition-all">
            <Plus className="w-3.5 h-3.5" />
            {lang === 'zh' ? '新建卡片' : 'New Card'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <ScheduleAddForm lang={lang} todayString={todayString}
          initialStatus={addFormInitialStatus}
          columns={columns}
          onAdd={handleAddEvent}
          onClose={() => setShowAddForm(false)}
        />
      )}
      </div>{/* end shrink-0 header */}

      {/* 看板主体 — 填满剩余高度 */}
      <div className="flex-1 min-h-0 overflow-hidden px-8">
      <ScheduleKanbanView
        lang={lang} columns={columns} activeFilteredList={activeFilteredList}
        dragOverColumn={dragOverColumn} draggingId={draggingId}
        onDragStart={onDragStart} onDragEnd={onDragEnd}
        onDragOverColumn={onDragOverColumn} onDropColumn={handleDropColumn}
        onOpenEvent={setSelectedEventForView}
        onDeleteEvent={handleDeleteEvent} onShiftCard={handleShiftCard}
        onDraftHere={colId => openAddForm(colId)}
        onAddColumn={handleAddColumn}
        onRenameColumn={handleRenameColumn}
        onDeleteColumn={handleDeleteColumn}
      />
      </div>{/* end flex-1 kanban */}

      {/* Footer */}
      <div className="shrink-0 px-8">
        <ScheduleFooter lang={lang} total={events.length} active={activeFilteredList.length} />
      </div>

      {selectedEventForView && (
        <ScheduleEventModal lang={lang} event={selectedEventForView}
          onClose={() => setSelectedEventForView(null)}
          onSave={handleSaveEvent}
          onDelete={id => { handleDeleteEvent(id); setSelectedEventForView(null); }}
        />
      )}
    </div>
  );
}
