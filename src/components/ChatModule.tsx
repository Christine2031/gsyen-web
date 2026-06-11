/**
 * ChatModule — UI shell only (~300 lines).
 * All business logic and large sub-views live in:
 *   hooks/useChatSession   — session persistence
 *   hooks/useChatStream    — streaming + schedule bridge
 *   utils/renderMessage    — markdown rendering
 *   utils/exportCard       — HTML card download
 *   config/models          — model list
 *   config/presets         — preset queries
 *   ActionCardView         — 神机百炼操作卡片渲染
 *   ChatSidebar            — 往来会话列表侧栏
 *   ChatEmptyState         — 空会话欢迎屏
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Sparkles, Send, Trash2,
  MessageSquare, PanelLeft, Plus,
} from 'lucide-react';

import { ChatMessage, ActionCard } from '../types/chat';
import { ModelId, MODELS } from '../config/models';
import { useChatSession } from '../hooks/useChatSession';
import { useChatStream } from '../hooks/useChatStream';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatSidebar } from './ChatSidebar';
import { ChatEmptyState } from './ChatEmptyState';
import { CanvasEditorContent } from './CanvasEditorContent';
import { ModelStatusLight } from './ModelStatusLight';
import { canvasStore } from '../stores/canvasStore';

interface ChatModuleProps { lang: 'zh' | 'en' }

export default function ChatModule({ lang }: ChatModuleProps) {
  const [inputVal, setInputVal]       = useState('');
  const [isCopiedId, setIsCopiedId]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelId>('ethan');
  const [toast, setToast]             = useState<string | null>(null);
  const [creativeDocId, setCreativeDocId] = useState<string | null>(null);
  // 创意国度：直接建文档 → 开全屏编辑器
  const openCreativeKingdom = () => {
    const now = new Date().toISOString();
    const doc = { id: `canvas-${Date.now()}`, title: '无标题', content: '', type: 'doc' as const,
      scope: 'self' as const, createdAt: now, updatedAt: now };
    canvasStore.add(doc);
    setCreativeDocId(doc.id);
  };

  const { messages, sessions, currentSessionId, setMessages, saveChat, loadSession, deleteSession, newChat } =
    useChatSession(lang);
  const { isLoading, send } = useChatStream();
  const pendingCard = useRef<ActionCard | null>(null);

  const chatEndRef       = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottom       = useRef(true);

  useEffect(() => {
    if (isAtBottom.current) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const modelScrollRef = useRef<HTMLDivElement>(null);
  const isDragging     = useRef(false);
  const dragStartX     = useRef(0);
  const dragScrollLeft = useRef(0);
  const onMsDragStart = (e: React.MouseEvent) => {
    const el = modelScrollRef.current; if (!el) return;
    isDragging.current   = true;
    dragStartX.current   = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
  };
  const onMsDragMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !modelScrollRef.current) return;
    e.preventDefault();
    modelScrollRef.current.scrollLeft =
      dragScrollLeft.current - (e.pageX - modelScrollRef.current.offsetLeft - dragStartX.current);
  };
  const onMsDragEnd = () => {
    isDragging.current = false;
    if (modelScrollRef.current) modelScrollRef.current.style.cursor = 'grab';
  };
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    const history = [...messages, userMsg];

    // 1. Save user message to session immediately
    saveChat(history, selectedModel);
    setInputVal('');

    const aiId   = `ai-${Date.now()}`;
    const aiTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 2. Show AI placeholder bubble right away
    setMessages([...history, { id: aiId, role: 'model', content: '▍', timestamp: aiTime }]);

    await send({
      text, model: selectedModel, history: messages, lang,
      // onToken: display only — no session write to avoid hundreds of upsert calls
      onToken: (partial) => {
        setMessages([...history, {
          id: aiId, role: 'model', content: partial, timestamp: aiTime,
          card: pendingCard.current ?? undefined,   // 卡片挂载后不被覆盖
        }]);
      },
      // onDone: single session write at end of stream
      onActionCard: (card) => {
        pendingCard.current = card;
        // 实时更新聊天气泡（卡片挂载到当前 AI 消息）
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, card } : m
        ));
      },
      onDone: (full) => {
        const card = pendingCard.current ?? undefined;
        pendingCard.current = null;
        saveChat([...history, { id: aiId, role: 'model', content: full, timestamp: aiTime, card }], selectedModel);
      },
      onError: (errMsg) => {
        pendingCard.current = null;
        saveChat([...history, { id: `err-${Date.now()}`, role: 'model', content: errMsg, timestamp: aiTime }], selectedModel);
      },
      onScheduleAction: (action, title) => {
        const zh: Record<string, string> = {
          create: `✅ 日程已创建：${title}`,
          update: `✏️ 日程已更新：${title}`,
          delete: `🗑️ 日程已删除：${title}`,
          query:  `📅 已查询今日日程`,
        };
        const en: Record<string, string> = {
          create: `✅ Event created: ${title}`,
          update: `✏️ Event updated: ${title}`,
          delete: `🗑️ Event deleted: ${title}`,
          query:  `📅 Today's schedule retrieved`,
        };
        showToast(lang === 'zh' ? (zh[action] ?? `✅ ${title}`) : (en[action] ?? `✅ ${title}`));
      },
    });
  }, [isLoading, messages, selectedModel, lang, saveChat, setMessages, send]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopiedId(id);
    setTimeout(() => setIsCopiedId(null), 2000);
  };

  return (
    <>
    <div className="flex-1 flex flex-col min-h-0 bg-[#F9F8F6]" id="ai-chat-root-workspace">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-2 border border-emerald-900/40">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Status bar */}
      <div className="relative shrink-0 h-[52px] px-8 border-b border-[#1A1A1A]/8 bg-[#F4F2EE] flex items-center justify-between font-mono text-[9px] tracking-widest text-[#1A1A1A]/55 font-bold uppercase">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className={`p-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all ${sidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'text-[#1A1A1A]/70'}`}>
            <PanelLeft className="w-4 h-4" />
          </button>
          <button onClick={newChat} className="flex items-center gap-1 px-2 py-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] rounded-none transition-all text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70">
            <Plus className="w-3 h-3" /><span>NEW</span>
          </button>
          <button onClick={openCreativeKingdom}
            className="flex items-center gap-2 px-2 py-1.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] rounded-none transition-all text-[10px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '疆域灵感创意国度' : 'GSYEN Muse'}</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">MODEL:</span>
            <div ref={modelScrollRef} onMouseDown={onMsDragStart} onMouseMove={onMsDragMove} onMouseUp={onMsDragEnd} onMouseLeave={onMsDragEnd}
              className="flex bg-[#1A1A1A]/5 p-0.5 border border-[#1A1A1A]/10 overflow-x-scroll select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ maxWidth: 224, cursor: 'grab' }}>
              {MODELS.map(m => (
                <button key={m.id} onClick={() => !m.disabled && setSelectedModel(m.id as ModelId)} disabled={m.disabled}
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold tracking-widest uppercase shrink-0 rounded-none transition-all ${m.disabled ? 'text-[#1A1A1A]/20 cursor-not-allowed' : selectedModel === m.id ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <ModelStatusLight selectedModel={selectedModel} />
        </div>
      </div>


      {/* Body: sidebar + chat */}
      <div className="flex-grow flex flex-col md:flex-row min-h-0">

        {/* Sidebar */}
        <ChatSidebar
          lang={lang}
          open={sidebarOpen}
          recentsOpen={recentsOpen}
          setRecentsOpen={setRecentsOpen}
          sessions={sessions}
          currentSessionId={currentSessionId}
          loadSession={loadSession}
          deleteSession={deleteSession}
          onNewChat={newChat}
        />

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F9F8F6]">
          <div ref={chatContainerRef} onScroll={() => {
            const el = chatContainerRef.current; if (!el) return;
            isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }} className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">

            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <ChatEmptyState lang={lang} inputVal={inputVal} setInputVal={setInputVal} onSend={handleSend} />
            )}

            {/* Message stream */}
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <ChatMessageBubble key={msg.id} msg={msg} lang={lang} isCopiedId={isCopiedId} onCopy={handleCopy} />
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3 max-w-3xl">
                <div className="w-7 h-7 flex items-center justify-center rounded-full bg-[#1A1A1A] text-[#F9F8F6] shrink-0 mt-1">
                  <Sparkles className="w-3 h-3" />
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] font-mono tracking-wider uppercase text-neutral-400">
                    <span className="font-bold text-[#1A1A1A]/50">{lang === 'zh' ? 'Atelier AI' : 'ATELIER AI'}</span>
                  </div>
                  <div className="pt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div className={`shrink-0 p-4 border-t border-[#1A1A1A]/10 bg-white ${messages.length === 0 ? 'hidden' : ''}`}>
            <form onSubmit={(e) => { e.preventDefault(); handleSend(inputVal); }} className="flex items-center gap-2">
              <button type="button" onClick={() => { if (window.confirm(lang === 'zh' ? '确定清空所有聊天记录？' : 'Wipe all history?')) newChat(); }}
                className="p-3 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition-colors text-neutral-500 rounded-none shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
              <input type="text"
                placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、符号创意、日程安排吧...' : 'Ask Atelier AI anything about brand, design, or schedules...'}
                value={inputVal} onChange={e => setInputVal(e.target.value)}
                className="flex-grow p-3 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white rounded-none outline-none font-sans text-xs text-[#1A1A1A]" />
              <button type="submit" disabled={!inputVal.trim()}
                className="p-3 bg-[#1A1A1A] text-white disabled:bg-[#1A1A1A]/10 disabled:text-neutral-300 transition-colors rounded-none shrink-0 border border-[#1A1A1A]">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
    {creativeDocId && (
      <CanvasEditorContent docId={creativeDocId} onClose={() => setCreativeDocId(null)} />
    )}
    </>
  );
}
