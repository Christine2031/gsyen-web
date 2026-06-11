/** KanbanModule — 每个 Chat Session 对应独立看板工作流 */
import React, { useState, useEffect } from 'react';
import { CheckCircle2, Plus, Search, PanelLeft, MessageSquare, Trash2, Send } from 'lucide-react';
import { categoryMap } from '../config/scheduleConfig';

import { EventItem, ColumnId } from '../types/schedule';
import { StoredSession }       from '../types/chat';
import { useDragDrop }         from '../hooks/useDragDrop';
import { sessionKanbanStore, KanbanColumn } from '../stores/sessionKanbanStore';
import { chatSessionStore }    from '../stores/chatSessionStore';
import { runSessionGC }        from '../stores/sessionGC';

import ScheduleAddForm    from './ScheduleAddForm';
import ScheduleKanbanView from './ScheduleKanbanView';
import ScheduleEventModal from './ScheduleEventModal';

interface KanbanModuleProps { lang: 'zh' | 'en'; }

export default function KanbanModule({ lang }: KanbanModuleProps) {
  const todayDate   = new Date();
  const todayString = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;

  const [activeSessionId, setActiveSessionId] = useState('default');
  const [columns,  setColumns]  = useState<KanbanColumn[]>(() => sessionKanbanStore.getCols('default'));
  const [events,   setEvents]   = useState<EventItem[]>  (() => sessionKanbanStore.getCards('default'));
  const [sessions, setSessions] = useState<StoredSession[]>(() => chatSessionStore.loadAll());

  // GC: 挂载时回收 24h 空 session
  useEffect(() => { runSessionGC(); setSessions(chatSessionStore.loadAll()); }, []);

  // reload kanban when session switches
  useEffect(() => {
    setColumns(sessionKanbanStore.getCols(activeSessionId));
    setEvents(sessionKanbanStore.getCards(activeSessionId));
  }, [activeSessionId]);

  // sync listeners
  useEffect(() => {
    const syncCols  = () => setColumns(sessionKanbanStore.getCols(activeSessionId));
    const syncCards = () => setEvents(sessionKanbanStore.getCards(activeSessionId));
    const syncSess  = () => setSessions(chatSessionStore.loadAll());
    window.addEventListener('kanban-columns-updated', syncCols);
    window.addEventListener('schedule-updated', syncCards);
    window.addEventListener('storage', syncSess);
    return () => {
      window.removeEventListener('kanban-columns-updated', syncCols);
      window.removeEventListener('schedule-updated', syncCards);
      window.removeEventListener('storage', syncSess);
    };
  }, [activeSessionId]);

  const [sidebarOpen,          setSidebarOpen]          = useState(true);
  const [filterCategory,       setFilterCategory]       = useState('all');
  const [searchText,           setSearchText]           = useState('');
  const [chatInput,            setChatInput]            = useState('');
  const [showAddForm,          setShowAddForm]          = useState(false);
  const [addFormInitialStatus, setAddFormInitialStatus] = useState<ColumnId>('todo');
  const [selectedEventForView, setSelectedEventForView] = useState<EventItem | null>(null);
  const [notification,         setNotification]         = useState<string | null>(null);

  const { draggingId, dragOverColumn, onDragStart, onDragEnd, onDragOverColumn, onDropColumn } = useDragDrop();

  const sid    = activeSessionId;
  const notify = (t: string) => { setNotification(t); setTimeout(() => setNotification(null), 3500); };

  const handleNewSession = () => {
    const id = `session-${Date.now()}`;
    chatSessionStore.upsert(id, [], 'ethan');
    const updated = chatSessionStore.loadAll();
    setSessions(updated);
    setActiveSessionId(id);
  };

  const activeFilteredList = events.filter(item => {
    const matchSearch   = item.title.toLowerCase().includes(searchText.toLowerCase()) ||
                          item.subtitle.toLowerCase().includes(searchText.toLowerCase());
    const matchCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const handleAddColumn    = (title: string)           => setColumns(sessionKanbanStore.addCol(sid, title));
  const handleRenameColumn = (id: string, t: string)   => setColumns(sessionKanbanStore.renameCol(sid, id, t));
  const handleDeleteColumn = (id: string) => {
    if (columns.length <= 1) return;
    const fallback = columns.find(c => c.id !== id)?.id ?? '';
    events.filter(e => (e.status || 'todo') === id)
          .forEach(e => setEvents(sessionKanbanStore.updateCard(sid, e.id, { status: fallback })));
    setColumns(sessionKanbanStore.removeCol(sid, id));
  };

  const openAddForm      = (status: ColumnId = columns[0]?.id ?? 'todo') => { setAddFormInitialStatus(status); setShowAddForm(true); };
  const handleAddEvent   = (ev: EventItem) => { setEvents(sessionKanbanStore.addCard(sid, ev)); notify(lang === 'zh' ? `Deploy: ${ev.title}` : `Card deployed: ${ev.title}`); };
  const handleSaveEvent  = (id: string, ch: Partial<EventItem>) => { setEvents(sessionKanbanStore.updateCard(sid, id, ch)); notify(lang === 'zh' ? '已保存' : 'Saved'); };
  const handleDeleteEvent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = events.find(ev => ev.id === id);
    setEvents(sessionKanbanStore.removeCard(sid, id));
    if (selectedEventForView?.id === id) setSelectedEventForView(null);
    notify(lang === 'zh' ? `丢弃: ${item?.title}` : `Purged: ${item?.title}`);
  };
  const handleClearAll = () => {
    if (!window.confirm(lang === 'zh' ? '清空全部卡片？' : 'Clear all cards?')) return;
    setEvents(sessionKanbanStore.clearCards(sid));
    setSelectedEventForView(null); notify(lang === 'zh' ? '已清空' : 'Cleared');
  };
  const handleDropColumn = (e: React.DragEvent, targetStatus: ColumnId) => {
    const id = onDropColumn(e);
    if (id) { setEvents(sessionKanbanStore.updateCard(sid, id, { status: targetStatus, completed: targetStatus === 'done' })); notify(lang === 'zh' ? `已移至 ${targetStatus}` : `Moved`); }
  };
  const handleShiftCard = (id: string, dir: 'back' | 'forward', e: React.MouseEvent) => {
    e.stopPropagation();
    const colIds = columns.map(c => c.id);
    const ev = events.find(item => item.id === id); if (!ev) return;
    const cur = colIds.indexOf(ev.status || colIds[0]);
    const nxt = dir === 'forward' ? Math.min(cur+1, colIds.length-1) : Math.max(cur-1, 0);
    if (nxt !== cur) setEvents(sessionKanbanStore.updateCard(sid, id, { status: colIds[nxt], completed: colIds[nxt] === 'done' }));
  };

  return (
    <div className="flex flex-col h-full text-[#1A1A1A] font-sans animate-fadeIn">
      {notification && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 border border-amber-900/40 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-bounce" /><span>{notification}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="relative shrink-0 h-[52px] flex items-center gap-2 px-8 border-b border-[#1A1A1A]/8 bg-[#F4F2EE]">
        <button onClick={() => setSidebarOpen(o => !o)} className={`p-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all shrink-0 ${sidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'text-[#1A1A1A]/70'}`}>
          <PanelLeft className="w-4 h-4" />
        </button>
        <button onClick={handleNewSession} className="flex items-center gap-1 px-2 py-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] rounded-none transition-all text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 shrink-0">
          <Plus className="w-3 h-3" /><span>NEW</span>
        </button>
        <div className="flex-1" />
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#1A1A1A]/40" />
          <input type="text" placeholder={lang === 'zh' ? '搜索卡片…' : 'Search cards…'}
            value={searchText} onChange={e => setSearchText(e.target.value)}
            className="w-44 pl-8 pr-3 py-1.5 text-xs border border-[#1A1A1A]/10 bg-transparent focus:bg-white focus:outline-none focus:border-[#1A1A1A]/30 transition-colors" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="py-1.5 px-2 border border-[#1A1A1A]/10 text-[10px] font-mono bg-transparent text-[#1A1A1A] cursor-pointer shrink-0">
          <option value="all">{lang === 'zh' ? '全部' : 'All'}</option>
          {Object.entries(categoryMap).map(([key, val]) => (
            <option key={key} value={key}>{lang === 'zh' ? val.zhLabel : val.enLabel}</option>
          ))}
        </select>
        <button onClick={handleClearAll} className="px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase border border-red-200 text-red-700 hover:bg-red-50 transition-all shrink-0">
          {lang === 'zh' ? '清空' : 'Clear'}
        </button>
        <button onClick={() => openAddForm()} className="px-3 py-1.5 bg-[#1A1A1A] text-[#F9F8F6] text-[10px] font-bold font-mono tracking-widest uppercase flex items-center gap-1.5 hover:bg-[#1A1A1A]/80 transition-all shrink-0">
          <Plus className="w-3.5 h-3.5" />{lang === 'zh' ? '新建卡片' : 'New Card'}
        </button>
      </div>


      {/* 主体 */}
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">

        {/* 往来侧边栏 */}
        <aside className={`shrink-0 flex flex-col border-r border-[#1A1A1A]/10 bg-[#F4F2EE] transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-[320px] p-6 opacity-100' : 'w-0 p-0 opacity-0 pointer-events-none'}`}>
          <div className="flex flex-col h-full min-w-[272px] gap-4">
            <div className="flex items-center justify-between w-full">
              <h2 className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70">{lang === 'zh' ? '往来' : 'Recents'}</h2>
              <span className="text-[8px] font-mono text-[#1A1A1A]/25">{sessions.length}</span>
            </div>
            {/* default 入口 — 与 session 条目完全一致 */}
            <div onClick={() => setActiveSessionId('default')}
              className={`group flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${activeSessionId === 'default' ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-sans text-[#1A1A1A]/80 leading-snug">Default Message</p>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-mono text-[#1A1A1A]/30 uppercase">{new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase">ETHAN</span>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto space-y-1.5 pr-0.5 flex-1">
              {sessions.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <MessageSquare className="w-6 h-6 text-[#1A1A1A]/15 mx-auto" />
                  <p className="text-[9px] font-mono text-[#1A1A1A]/30 uppercase tracking-widest">{lang === 'zh' ? '暂无记录' : 'No sessions yet'}</p>
                </div>
              ) : sessions.map(s => (
                <div key={s.id} onClick={() => setActiveSessionId(s.id)}
                  className={`group flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${activeSessionId === s.id ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2">{s.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-[#1A1A1A]/30 uppercase">{new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                      <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase">{s.model}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* 右侧主内容 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {showAddForm && (
            <div className="shrink-0 px-8 pt-4">
              <ScheduleAddForm lang={lang} todayString={todayString} initialStatus={addFormInitialStatus}
                columns={columns} onAdd={handleAddEvent} onClose={() => setShowAddForm(false)} />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden px-8">
            <ScheduleKanbanView
              lang={lang} columns={columns} activeFilteredList={activeFilteredList}
              dragOverColumn={dragOverColumn} draggingId={draggingId}
              onDragStart={onDragStart} onDragEnd={onDragEnd}
              onDragOverColumn={onDragOverColumn} onDropColumn={handleDropColumn}
              onOpenEvent={setSelectedEventForView}
              onDeleteEvent={handleDeleteEvent} onShiftCard={handleShiftCard}
              onDraftHere={colId => openAddForm(colId)}
              onAddColumn={handleAddColumn} onRenameColumn={handleRenameColumn} onDeleteColumn={handleDeleteColumn}
              onReorderColumn={(fromId, toId) => setColumns(sessionKanbanStore.reorderCols(sid, fromId, toId))}
            />
          </div>

          <div className="shrink-0 p-4 border-t border-[#1A1A1A]/10 bg-white">
            <form onSubmit={e => e.preventDefault()} className="flex items-center gap-2">
              <button type="button" onClick={() => setChatInput('')} className="p-3 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition-colors text-neutral-500 rounded-none shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、符号创意、日程安排吧...' : 'Ask Atelier AI anything...'}
                className="flex-grow p-3 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white rounded-none outline-none font-sans text-xs text-[#1A1A1A]" />
              <button type="submit" disabled={!chatInput.trim()} className="p-3 bg-[#1A1A1A] text-white disabled:bg-[#1A1A1A]/10 disabled:text-neutral-300 transition-colors rounded-none shrink-0 border border-[#1A1A1A]">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {selectedEventForView && (
            <ScheduleEventModal lang={lang} event={selectedEventForView}
              onClose={() => setSelectedEventForView(null)} onSave={handleSaveEvent}
              onDelete={id => { handleDeleteEvent(id); setSelectedEventForView(null); }} />
          )}
        </div>
      </div>
    </div>
  );
}
