/**
 * ScheduleModule — pure coordinator (~200 lines).
 *
 * State & logic only. All rendering delegated to:
 *   ScheduleAddForm   · ScheduleSidebar  · ScheduleMonthView
 *   ScheduleWeekView  · ScheduleDayView  · ScheduleKanbanView
 *   ScheduleEventModal
 */
import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { ScheduleToolbar, type ViewMode } from './ScheduleChrome';
import { EventItem } from '../types/schedule';
import { DEFAULT_EVENTS }       from '../config/scheduleConfig';
import { useScheduleEvents }    from '../hooks/useScheduleEvents';
import { scheduleStore }        from '../stores/scheduleStore';
import { useDragDrop }          from '../hooks/useDragDrop';
import { useMiniCalendarDays, useMainCalendarDays, useWeekDays } from '../hooks/useCalendarDays';

import ScheduleAddForm    from './ScheduleAddForm';
import ScheduleSidebar    from './ScheduleSidebar';
import ScheduleMonthView  from './ScheduleMonthView';
import ScheduleWeekView   from './ScheduleWeekView';
import ScheduleDayView    from './ScheduleDayView';
import ScheduleEventModal from './ScheduleEventModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleModuleProps {
  lang: 'zh' | 'en';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduleModule({ lang }: ScheduleModuleProps) {
  const todayDate   = new Date();
  const todayString = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;

  // ── UI State ──────────────────────────────────────────────────────────────
  const [viewMode,          setViewMode]          = useState<ViewMode>('month');
  const [filterCategory,    setFilterCategory]    = useState('all');
  const [searchText,        setSearchText]        = useState('');
  const [isSidebarOpen,     setIsSidebarOpen]     = useState(true);
  const [selectedDate,      setSelectedDate]      = useState<Date>(new Date());
  const [visibleCategories, setVisibleCategories] = useState<Record<string, boolean>>({
    creative: true, finance: true, secure: true, strategy: true,
  });
  const [showAddForm,           setShowAddForm]           = useState(false);
  const [addFormInitialDate,    setAddFormInitialDate]    = useState<string | undefined>(undefined);
  const [selectedEventForView,  setSelectedEventForView]  = useState<EventItem | null>(null);
  const [notification,          setNotification]          = useState<string | null>(null);

  // ── Data & Calendar Hooks ─────────────────────────────────────────────────
  const { events, addEvent, updateEvent, removeEvent, moveEvent } = useScheduleEvents(DEFAULT_EVENTS);
  const { draggingId, dragOverDate,
          onDragStart, onDragEnd,
          onDragOverDate, onDropDate } = useDragDrop();

  const miniCalendarDays     = useMiniCalendarDays(selectedDate);
  const mainCalendarGridDays = useMainCalendarDays(selectedDate, events);
  const currentWeekDaysList  = useWeekDays(selectedDate, lang);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const notify = (text: string) => {
    setNotification(text);
    setTimeout(() => setNotification(null), 3500);
  };

  const activeFilteredList = events.filter(item => {
    const matchSearch   = item.title.toLowerCase().includes(searchText.toLowerCase()) ||
                          item.subtitle.toLowerCase().includes(searchText.toLowerCase());
    const matchCategory = filterCategory === 'all' || item.category === filterCategory;
    const matchVisible  = visibleCategories[item.category] !== false;
    return matchSearch && matchCategory && matchVisible;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAddForm = (dateStr?: string) => {
    setAddFormInitialDate(dateStr);
    setShowAddForm(true);
  };

  const handleAddEvent = (event: EventItem) => {
    addEvent(event);
    notify(lang === 'zh' ? `信条安排 Deploy 成功: ${event.title}` : `Card successfully deployed: ${event.title}`);
  };

  const handleDeleteEvent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = events.find(ev => ev.id === id);
    removeEvent(id);
    if (selectedEventForView?.id === id) setSelectedEventForView(null);
    notify(lang === 'zh' ? `丢弃卡片: ${item?.title}` : `Incident card purged from database`);
  };

  const handleClearAll = () => {
    if (!window.confirm(lang === 'zh' ? '清空全部日程？此操作不可撤销。' : 'Clear all events? This cannot be undone.')) return;
    scheduleStore.clearAll();
    window.dispatchEvent(new CustomEvent('schedule-updated'));
    setSelectedEventForView(null);
    notify(lang === 'zh' ? '已清空全部日程' : 'All events cleared');
  };

  const handleSaveEvent = (id: string, changes: Partial<EventItem>) => {
    updateEvent(id, changes);
    notify(lang === 'zh' ? '信条变动调整已同步保存' : 'Manuscript revisions deployed & updated successfully');
  };

  const handleDropDate = (e: React.DragEvent, dateStr: string) => {
    const id = onDropDate(e);
    if (id) {
      const movedItem = events.find(item => item.id === id);
      moveEvent(id, dateStr);
      notify(lang === 'zh' ? `日程已拖拽至: ${dateStr}` : `Event "${movedItem?.title}" rescheduled to ${dateStr}`);
    }
  };

  const handleNavigateToday = () => {
    setSelectedDate(new Date());
    notify(lang === 'zh' ? `已转跳回今天 ${todayString}` : `Centered calendar back to today ${todayString}`);
  };

  const handleNavigateDiff = (amount: number) => {
    const next = new Date(selectedDate);
    if      (viewMode === 'month') next.setMonth(next.getMonth() + amount);
    else if (viewMode === 'week')  next.setDate(next.getDate() + amount * 7);
    else if (viewMode === 'day')   next.setDate(next.getDate() + amount);
    setSelectedDate(next);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 text-[#1A1A1A] font-sans animate-fadeIn">

      {/* Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 border border-amber-900/40 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-bounce" />
          <span>{notification}</span>
        </div>
      )}

      {/* Toolbar — 模块身份由顶栏 logo 区承担，此处不再重复标题 */}
      <ScheduleToolbar
        total={events.length} active={activeFilteredList.length}
        lang={lang}
        viewMode={viewMode} setViewMode={setViewMode}
        searchText={searchText} setSearchText={setSearchText}
        filterCategory={filterCategory} setFilterCategory={setFilterCategory}
        isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
        showAddForm={showAddForm} setShowAddForm={setShowAddForm}
        onClearAll={handleClearAll}
      />

      {/* Add form drawer */}
      {showAddForm && (
        <ScheduleAddForm
          lang={lang}
          todayString={todayString}
          initialDate={addFormInitialDate}
          onAdd={handleAddEvent}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Main layout: sidebar + view */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* Sidebar */}
        <aside className={`bg-white border-[#1A1A1A]/10 rounded-none shadow-sm flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          isSidebarOpen ? 'w-full lg:w-[280px] p-4 border opacity-100' : 'w-0 lg:w-0 p-0 border-transparent opacity-0 pointer-events-none'
        }`}>
            <ScheduleSidebar
              lang={lang}
              selectedDate={selectedDate}
              events={events}
              miniCalendarDays={miniCalendarDays}
              visibleCategories={visibleCategories}
              onSelectDate={(date, dateStr) => { setSelectedDate(date); }}
              onToggleCategory={cat => setVisibleCategories(p => ({ ...p, [cat]: !p[cat] }))}
              onSelectAllCategories={on => setVisibleCategories({ creative: on, finance: on, secure: on, strategy: on })}
              onNavigateDiff={handleNavigateDiff}
              onNavigateToday={handleNavigateToday}
              onOpenAddForm={dateStr => openAddForm(dateStr)}
            />
        </aside>

        {/* Main view */}
        <section className="flex-grow flex-1 min-w-0 w-full">
          {viewMode === 'month' && (
            <ScheduleMonthView
              lang={lang} todayDate={todayDate} selectedDate={selectedDate}
              mainCalendarGridDays={mainCalendarGridDays} activeFilteredList={activeFilteredList}
              dragOverDate={dragOverDate} draggingId={draggingId}
              onDragStart={onDragStart} onDragEnd={onDragEnd}
              onDragOverDate={onDragOverDate} onDropDate={handleDropDate}
              onOpenEvent={setSelectedEventForView}
              onNavigateToday={handleNavigateToday} onNavigate={handleNavigateDiff}
              onQuickAdd={handleAddEvent}
            />
          )}
          {viewMode === 'week' && (
            <ScheduleWeekView
              lang={lang} currentWeekDaysList={currentWeekDaysList} activeFilteredList={activeFilteredList}
              dragOverDate={dragOverDate} draggingId={draggingId}
              onDragStart={onDragStart} onDragEnd={onDragEnd}
              onDragOverDate={onDragOverDate} onDropDate={handleDropDate}
              onOpenEvent={setSelectedEventForView}
              onNavigateToday={handleNavigateToday} onNavigate={handleNavigateDiff}
            />
          )}
          {viewMode === 'day' && (
            <ScheduleDayView
              lang={lang} selectedDate={selectedDate} todayString={todayString}
              activeFilteredList={activeFilteredList}
              onOpenEvent={setSelectedEventForView}
              onNavigateToday={handleNavigateToday} onNavigate={handleNavigateDiff}
            />
          )}
        </section>
      </div>

      {/* Event detail / edit modal */}
      {selectedEventForView && (
        <ScheduleEventModal
          lang={lang}
          event={selectedEventForView}
          onClose={() => setSelectedEventForView(null)}
          onSave={handleSaveEvent}
          onDelete={id => { handleDeleteEvent(id); setSelectedEventForView(null); }}
        />
      )}

    </div>
  );
}
