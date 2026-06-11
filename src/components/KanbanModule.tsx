/**
 * KanbanModule — 对话即 Board
 * 左侧：往来会话列表（来自 chatSessionStore）
 * 右侧：当前 Board 的看板（列+卡片按 boardId = sessionId 隔离）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, PanelLeft } from 'lucide-react';
import { StoredSession } from '../types/chat';
import { chatSessionStore } from '../stores/chatSessionStore';
import { kanbanColumnStore, KanbanColumn } from '../stores/kanbanColumnStore';
import { kanbanCardStore,   KanbanCard   } from '../stores/kanbanCardStore';
import BoardKanbanView from './BoardKanbanView';

interface KanbanModuleProps { lang: 'zh' | 'en'; }

export default function KanbanModule({ lang }: KanbanModuleProps) {
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [sessions,    setSessions]      = useState<StoredSession[]>(() => chatSessionStore.loadAll());
  const [boardId,     setBoardId]       = useState<string | null>(() => chatSessionStore.loadAll()[0]?.id ?? null);
  const [columns,     setColumns]       = useState<KanbanColumn[]>([]);
  const [cards,       setCards]         = useState<KanbanCard[]>([]);

  // ── 监听 sessions 变化（来自 ChatModule 写入 localStorage）────────────────
  useEffect(() => {
    const sync = () => {
      const all = chatSessionStore.loadAll();
      setSessions(all);
      // 若当前 board 已被删除，切到第一个
      if (boardId && !all.find(s => s.id === boardId)) setBoardId(all[0]?.id ?? null);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [boardId]);

  // ── 加载当前 Board 的列和卡片 ──────────────────────────────────────────────
  const reloadBoard = useCallback(() => {
    if (!boardId) return;
    setColumns(kanbanColumnStore.getAll(boardId));
    setCards(kanbanCardStore.getAll(boardId));
  }, [boardId]);

  useEffect(() => { reloadBoard(); }, [reloadBoard]);

  useEffect(() => {
    window.addEventListener('kanban-columns-updated', reloadBoard);
    window.addEventListener('kanban-cards-updated',   reloadBoard);
    return () => {
      window.removeEventListener('kanban-columns-updated', reloadBoard);
      window.removeEventListener('kanban-cards-updated',   reloadBoard);
    };
  }, [reloadBoard]);

  // ── 列操作 ────────────────────────────────────────────────────────────────
  const handleAddColumn    = (title: string)             => boardId && kanbanColumnStore.add(boardId, title);
  const handleRenameColumn = (id: string, title: string) => boardId && kanbanColumnStore.rename(boardId, id, title);
  const handleDeleteColumn = (id: string) => {
    if (!boardId || columns.length <= 1) return;
    const fallback = columns.find(c => c.id !== id)?.id ?? '';
    cards.filter(c => c.columnId === id).forEach(c => kanbanCardStore.move(boardId, c.id, fallback));
    kanbanColumnStore.remove(boardId, id);
  };

  // ── 卡片操作 ──────────────────────────────────────────────────────────────
  const handleAddCard    = (columnId: string, title: string, desc: string) =>
    boardId && kanbanCardStore.add(boardId, columnId, title, desc);

  const handleDeleteCard = (id: string) =>
    boardId && kanbanCardStore.remove(boardId, id);

  const handleMoveCard   = (id: string, columnId: string) =>
    boardId && kanbanCardStore.move(boardId, id, columnId);

  const handleShiftCard  = (id: string, dir: 'back' | 'forward') => {
    if (!boardId) return;
    const colIds = columns.map(c => c.id);
    const card   = cards.find(c => c.id === id);
    if (!card) return;
    const cur = colIds.indexOf(card.columnId);
    const nxt = dir === 'forward' ? Math.min(cur + 1, colIds.length - 1) : Math.max(cur - 1, 0);
    if (nxt !== cur) kanbanCardStore.move(boardId, id, colIds[nxt]);
  };

  // ── 当前 Board 信息 ───────────────────────────────────────────────────────
  const activeSession = sessions.find(s => s.id === boardId);

  return (
    <div className="flex h-full min-h-[600px] text-[#1A1A1A] font-sans animate-fadeIn" style={{ minHeight: '600px' }}>

      {/* ── 左侧：往来列表 ───────────────────────────────────────────────── */}
      <aside className={`shrink-0 flex flex-col border-r border-[#1A1A1A]/10 bg-[#F4F2EE] transition-all duration-200 overflow-hidden ${
        sidebarOpen ? 'w-[220px]' : 'w-0'
      }`}>
        <div className="px-3 pt-4 pb-2 shrink-0">
          <p className="text-[9px] font-mono font-bold tracking-[0.25em] uppercase text-[#1A1A1A]/45">
            {lang === 'zh' ? '往来 · 看板' : 'Sessions · Boards'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {sessions.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <MessageSquare className="w-5 h-5 text-[#1A1A1A]/15 mx-auto mb-2" />
              <p className="text-[9px] font-mono text-[#1A1A1A]/30 uppercase tracking-widest leading-relaxed">
                {lang === 'zh' ? '前往灵阁新建\n对话即可创建 Board' : 'Go to Muse to\ncreate a board'}
              </p>
            </div>
          ) : sessions.map(s => (
            <button key={s.id} onClick={() => setBoardId(s.id)}
              className={`w-full text-left px-2.5 py-2 transition-all ${
                boardId === s.id
                  ? 'bg-[#1A1A1A] text-[#F9F8F6]'
                  : 'text-[#1A1A1A]/65 hover:bg-[#1A1A1A]/6 hover:text-[#1A1A1A]'
              }`}
            >
              <p className="text-[11px] font-medium leading-snug line-clamp-2">{s.title}</p>
              <p className={`text-[8px] font-mono uppercase tracking-wider mt-0.5 ${boardId === s.id ? 'text-[#F9F8F6]/45' : 'text-[#1A1A1A]/30'}`}>
                {s.model} · {new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* ── 右侧：看板内容 ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* 顶部栏 */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[#1A1A1A]/8 bg-white/60">
          <button onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 text-[#1A1A1A]/40 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/5 transition-all">
            <PanelLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            {activeSession ? (
              <>
                <h2 className="text-sm font-semibold text-[#1A1A1A] truncate">{activeSession.title}</h2>
                <p className="text-[8.5px] font-mono text-[#1A1A1A]/35 uppercase tracking-widest">
                  {columns.length} {lang === 'zh' ? '列' : 'lists'} · {cards.length} {lang === 'zh' ? '卡片' : 'cards'}
                </p>
              </>
            ) : (
              <p className="text-sm text-[#1A1A1A]/40">{lang === 'zh' ? '从左侧选择一个 Board' : 'Select a board from the left'}</p>
            )}
          </div>
        </div>

        {/* 看板主体 */}
        <div className="flex-1 overflow-auto p-4">
          {!boardId ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <MessageSquare className="w-10 h-10 text-[#1A1A1A]/10" />
              <p className="text-xs font-mono text-[#1A1A1A]/30 uppercase tracking-widest">
                {lang === 'zh' ? '每一个对话都是一个 Board\n前往疆域灵阁开始对话' : 'Each conversation is a Board\nGo to GSYEN Muse to start'}
              </p>
            </div>
          ) : (
            <BoardKanbanView
              columns={columns}
              cards={cards}
              onAddColumn={handleAddColumn}
              onRenameColumn={handleRenameColumn}
              onDeleteColumn={handleDeleteColumn}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
              onMoveCard={handleMoveCard}
              onShiftCard={handleShiftCard}
            />
          )}
        </div>
      </div>
    </div>
  );
}
