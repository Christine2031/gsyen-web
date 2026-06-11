/**
 * KanbanModule — 项目看板 + 嵌入聊天
 * 往来侧边栏点击加载对应会话，下方 KanbanChatPanel 展示消息。
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Plus, Search, X, PanelLeft, MessageSquare } from 'lucide-react';
import { KanbanIcon } from '../gsyen-designer';

import { EventItem, ColumnId }  from '../types/schedule';
import { ActionCard }           from '../types/chat';
import { DEFAULT_EVENTS }       from '../config/scheduleConfig';
import { useScheduleEvents }    from '../hooks/useScheduleEvents';
import { scheduleStore }        from '../stores/scheduleStore';
import { useDragDrop }          from '../hooks/useDragDrop';
import { kanbanColumnStore, KanbanColumn } from '../stores/kanbanColumnStore';
import { useChatSession }       from '../hooks/useChatSession';
import { useChatStream }        from '../hooks/useChatStream';
import { ModelId }              from '../config/models';

import ScheduleAddForm    from './ScheduleAddForm';
import ScheduleKanbanView from './ScheduleKanbanView';
import ScheduleEventModal from './ScheduleEventModal';
import { KanbanChatPanel } from './KanbanChatPanel';

interface KanbanModuleProps { lang: 'zh' | 'en'; }

export default function KanbanModule({ lang }: KanbanModuleProps) {
  const todayDate   = new Date();
  const todayString = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;

  // ── 列 ────────────────────────────────────────────────────────────────────
  const [columns, setColumns] = useState<KanbanColumn[]>(() => kanbanColumnStore.getAll());
  useEffect(() => {
    const sync = () => setColumns(kanbanColumnStore.getAll());
    window.addEventListener('kanban-columns-updated', sync);
    return () => window.removeEventListener('kanban-columns-updated', sync);
  }, []);

  // ── 聊天 ──────────────────────────────────────────────────────────────────
  const { messages, sessions, currentSessionId, setMessages, saveChat, loadSession, deleteSession, newChat } =
    useChatSession(lang);
  const { isLoading, send } = useChatStream();
  const [selectedModel, setSelectedModel] = useState<ModelId>('ethan');
  const [chatInputVal,  setChatInputVal]  = useState('');
  const pendingCard = useRef<ActionCard | null>(null);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg = {
      id: `u-${Date.now()}`, role: 'user' as const, content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    const history = [...messages, userMsg];
    saveChat(history, selectedModel);
    setChatInputVal('');
    const aiId   = `ai-${Date.now()}`;
    const aiTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages([...history, { id: aiId, role: 'model', content: '▍', timestamp: aiTime }]);
    await send({
      text, model: selectedModel, history: messages, lang,
      onToken:      (partial) => setMessages([...history, { id: aiId, role: 'model', content: partial, timestamp: aiTime, card: pendingCard.current ?? undefined }]),
      onActionCard: (card)    => { pendingCard.current = card; setMessages(prev => prev.map(m => m.id === aiId ? { ...m, card } : m)); },
      onDone:       (full)    => { const c = pendingCard.current ?? undefined; pendingCard.current = null; saveChat([...history, { id: aiId, role: 'model', content: full, timestamp: aiTime, card: c }], selectedModel); },
      onError:      (err)     => { pendingCard.current = null; saveChat([...history, { id: `err-${Date.now()}`, role: 'model', content: err, timestamp: aiTime }], selectedModel); },
    });
  }, [isLoading, messages, selectedModel, lang, saveChat, setMessages, send]);

  // ── 看板状态 ──────────────────────────────────────────────────────────────
  const [sidebarOpen,          setSidebarOpen]          = useState(true);
  const [filterCategory,       setFilterCategory]       = useState('all');
  const [searchText,           setSearchText]           = useState('');
  const [showAddForm,          setShowAddForm]          = useState(false);
  const [addFormInitialStatus, setAddFormInitialStatus] = useState<ColumnId>('todo');
  const [selectedEventForView, setSelectedEventForView] = useState<EventItem | null>(null);
  const [notification,         setNotification]         = useState<string | null>(null);

  const { events, addEvent, updateEvent, removeEvent, changeStatus } = useScheduleEvents(DEFAULT_EVENTS);
  const { draggingId, dragOverColumn, onDragStart, onDragEnd, onDragOverColumn, onDropColumn } = useDragDrop();

  const notify = (text: string) => { setNotification(text); setTimeout(() => setNotification(null), 3500); };

  const activeFilteredList = events.filter(item => {
    const matchSearch   = item.title.toLowerCase().includes(searchText.toLowerCase()) ||
                          item.subtitle.toLowerCase().includes(searchText.toLowerCase());
    const matchCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const handleAddColumn    = (title: string)               => kanbanColumnStore.add(title);
  const handleRenameColumn = (id: string, title: string)   => kanbanColumnStore.rename(id, title);
  const handleDeleteColumn = (id: string) => {
    if (columns.length <= 1) return;
    const fallback = columns.find(c => c.id !== id)?.id ?? '';
    events.filter(e => (e.status || 'todo') === id).forEach(e => changeStatus(e.id, fallback));
    kanbanColumnStore.remove(id);
  };

  const openAddForm = (status: ColumnId = columns[0]?.id ?? 'todo') => { setAddFormInitialStatus(status); setShowAddForm(true); };

  const handleAddEvent    = (event: EventItem) => { addEvent(event); notify(lang === 'zh' ? `Deploy 成功: ${event.title}` : `Card deployed: ${event.title}`); };
  const handleSaveEvent   = (id: string, changes: Partial<EventItem>) => { updateEvent(id, changes); notify(lang === 'zh' ? '已保存' : 'Saved'); };
  const handleDeleteEvent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const item = events.find(ev => ev.id === id);
    removeEvent(id);
    if (selectedEventForView?.id === id) setSelectedEventForView(null);
    notify(lang === 'zh' ? `丢弃卡片: ${item?.title}` : `Card purged: ${item?.title}`);
  };
  const handleClearAll = () => {
    if (!window.confirm(lang === 'zh' ? '清空全部卡片？' : 'Clear all cards?')) return;
    scheduleStore.clearAll(); window.dispatchEvent(new CustomEvent('schedule-updated'));
    setSelectedEventForView(null); notify(lang === 'zh' ? '已清空' : 'Cleared');
  };
  const handleDropColumn = (e: React.DragEvent, targetStatus: ColumnId) => {
    const id = onDropColumn(e);
    if (id) { changeStatus(id, targetStatus); notify(lang === 'zh' ? `已移至 ${targetStatus}` : `Moved to ${targetStatus}`); }
  };
  const handleShiftCard = (id: string, dir: 'back' | 'forward', e: React.MouseEvent) => {
    e.stopPropagation();
    const colIds = columns.map(c => c.id);
    const ev = events.find(item => item.id === id); if (!ev) return;
    const cur = colIds.indexOf(ev.status || colIds[0]);
    const nxt = dir === 'forward' ? Math.min(cur + 1, colIds.length - 1) : Math.max(cur - 1, 0);
    if (nxt !== cur) changeStatus(id, colIds[nxt]);
  };

  return (
    <div className="flex flex-row h-full text-[#1A1A1A] font-sans animate-fadeIn">

      {notification && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 border border-amber-900/40 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-bounce" /><span>{notification}</span>
        </div>
      )}

      {/* ── 往来侧边栏 ─────────────────────────────────────────────────── */}
      <aside className={`shrink-0 flex flex-col border-r border-[#1A1A1A]/10 bg-[#F4F2EE] transition-all duration-300 overflow-hidden ${
        sidebarOpen ? 'w-[320px] p-6 opacity-100' : 'w-0 p-0 opacity-0 pointer-events-none'
      }`}>
        <div className="flex flex-col h-full min-w-[272px] gap-4">
          <div className="flex items-center justify-between w-full">
            <h2 className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70">{lang === 'zh' ? '往来' : 'Recents'}</h2>
            <span className="text-[8px] font-mono text-[#1A1A1A]/25">{sessions.length}</span>
          </div>
          <div className="overflow-y-auto space-y-1.5 pr-0.5 flex-1">
            {sessions.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <MessageSquare className="w-6 h-6 text-[#1A1A1A]/15 mx-auto" />
                <p className="text-[9px] font-mono text-[#1A1A1A]/30 uppercase tracking-widest">{lang === 'zh' ? '暂无记录' : 'No history yet'}</p>
              </div>
            ) : sessions.map(s => (
              <div key={s.id} onClick={() => loadSession(s)}
                className={`group relative flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${currentSessionId === s.id ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[11px] font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2">{s.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono text-[#1A1A1A]/30 uppercase">{new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase">{s.model}</span>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 hover:text-red-500 text-[#1A1A1A]/30 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── 右侧主内容 ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* 顶部 chrome */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-[#EFEFEF] border-b border-[#1A1A1A]/8">
          <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/8 transition-all">
            <PanelLeft className="w-4 h-4" />
          </button>
          <button onClick={() => openAddForm()} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold font-mono tracking-widest uppercase text-[#1A1A1A]/60 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/8 transition-all">
            <Plus className="w-3 h-3" />NEW
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A]/8">
            <MessageSquare className="w-3.5 h-3.5 text-[#1A1A1A]/50" />
            <span className="text-[11px] font-sans text-[#1A1A1A]/75">{lang === 'zh' ? '疆域灵感创意国度' : 'Project Board'}</span>
          </div>
        </div>

        {/* 看板区：header + toolbar + board */}
        <div className="shrink-0 px-8 pt-4 pb-3 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-serif font-bold tracking-tight flex items-center gap-2">
                <span className="p-1.5 bg-[#1A1A1A] text-white"><KanbanIcon className="w-4 h-4" /></span>
                <span>{lang === 'zh' ? '项目看板' : 'Project Board'}</span>
              </h2>
              <p className="text-xs text-[#1A1A1A]/40 font-mono uppercase tracking-widest mt-0.5">
                {columns.length} {lang === 'zh' ? '列' : 'lists'} · {events.length} {lang === 'zh' ? '卡片' : 'cards'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#1A1A1A]/40" />
                <input type="text" placeholder={lang === 'zh' ? '搜索卡片…' : 'Search cards…'}
                  value={searchText} onChange={e => setSearchText(e.target.value)}
                  className="w-40 pl-9 pr-3 py-1.5 text-xs border border-[#1A1A1A]/10 bg-[#F9F8F6]/40 focus:bg-white focus:outline-none focus:border-[#1A1A1A]/40 transition-colors" />
              </div>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="p-1.5 px-2 border border-[#1A1A1A]/10 text-xs font-mono uppercase bg-transparent cursor-pointer">
                <option value="all">■ {lang === 'zh' ? '全部' : 'All'}</option>
                <option value="creative">{lang === 'zh' ? '创意' : 'Creative'}</option>
                <option value="finance">{lang === 'zh' ? '资产' : 'Finance'}</option>
                <option value="secure">{lang === 'zh' ? '保密' : 'Secure'}</option>
                <option value="strategy">{lang === 'zh' ? '战略' : 'Strategy'}</option>
              </select>
              <button onClick={handleClearAll} className="px-2.5 py-1.5 text-[9px] font-mono tracking-widest uppercase border border-red-200 text-red-700 hover:bg-red-50 transition-all">
                {lang === 'zh' ? '清空' : 'Clear'}
              </button>
              <button onClick={() => openAddForm()} className="px-3 py-1.5 bg-[#1A1A1A] text-[#F9F8F6] text-[10px] font-bold font-mono tracking-widest uppercase flex items-center gap-1.5 hover:bg-[#1A1A1A]/80 transition-all">
                <Plus className="w-3.5 h-3.5" />{lang === 'zh' ? '新建卡片' : 'New Card'}
              </button>
            </div>
          </div>
          {showAddForm && (
            <ScheduleAddForm lang={lang} todayString={todayString} initialStatus={addFormInitialStatus}
              columns={columns} onAdd={handleAddEvent} onClose={() => setShowAddForm(false)} />
          )}
        </div>

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
          />
        </div>

        {/* 嵌入聊天层 */}
        <KanbanChatPanel
          lang={lang} messages={messages} isLoading={isLoading}
          inputVal={chatInputVal} setInputVal={setChatInputVal}
          onSend={handleSend} onClear={newChat}
        />

        {selectedEventForView && (
          <ScheduleEventModal lang={lang} event={selectedEventForView}
            onClose={() => setSelectedEventForView(null)}
            onSave={handleSaveEvent}
            onDelete={id => { handleDeleteEvent(id); setSelectedEventForView(null); }} />
        )}
      </div>
    </div>
  );
}
