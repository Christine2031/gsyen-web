/**
 * ChatModule — UI shell only (~200 lines).
 * All business logic lives in:
 *   hooks/useChatSession   — session persistence
 *   hooks/useChatStream    — streaming + schedule bridge
 *   utils/renderMessage    — markdown rendering
 *   utils/exportCard       — HTML card download
 *   config/models          — model list
 *   config/presets         — preset queries
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import VintageCar from './VintageCar';
import {
  Sparkles, Send, Trash2, Copy, Check,
  Download, Terminal, MessageSquare, User,
  PanelLeft, Plus, X,
} from 'lucide-react';

import { ChatMessage } from '../types/chat';
import { ModelId, MODELS } from '../config/models';
import { PRESET_QUERIES, PRESET_SHORT_LABELS } from '../config/presets';
import { useChatSession } from '../hooks/useChatSession';
import { useChatStream } from '../hooks/useChatStream';
import { renderMessageContent } from '../utils/renderMessage';
import { exportQuoteCard } from '../utils/exportCard';

interface ChatModuleProps { lang: 'zh' | 'en' }

export default function ChatModule({ lang }: ChatModuleProps) {
  const [inputVal, setInputVal]       = useState('');
  const [isCopiedId, setIsCopiedId]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelId>('ethan');
  const [toast, setToast]             = useState<string | null>(null);

  const { messages, sessions, currentSessionId, saveChat, loadSession, deleteSession, newChat } =
    useChatSession(lang);
  const { isLoading, send } = useChatStream();

  // ── scroll management ──────────────────────────────────────────────────────
  const chatEndRef       = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottom       = useRef(true);

  useEffect(() => {
    if (isAtBottom.current) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── model selector drag-scroll ─────────────────────────────────────────────
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

  // ── send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    const history = [...messages, userMsg];
    saveChat(history, selectedModel);
    setInputVal('');

    const aiId   = `ai-${Date.now()}`;
    const aiTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await send({
      text, model: selectedModel, history: messages, lang,
      onToken: (partial) => {
        saveChat([...history, { id: aiId, role: 'model', content: partial, timestamp: aiTime }], selectedModel);
      },
      onDone: (full) => {
        saveChat([...history, { id: aiId, role: 'model', content: full, timestamp: aiTime }], selectedModel);
      },
      onError: (errMsg) => {
        saveChat([...history, { id: `err-${Date.now()}`, role: 'model', content: errMsg, timestamp: aiTime }], selectedModel);
      },
      onScheduleAdded: (title) => {
        showToast(lang === 'zh' ? `✅ 日程已添加：${title}` : `✅ Event added: ${title}`);
      },
    });
  }, [isLoading, messages, selectedModel, lang, saveChat, send]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopiedId(id);
    setTimeout(() => setIsCopiedId(null), 2000);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F9F8F6]" id="ai-chat-root-workspace">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-[#F9F8F6] px-5 py-3 text-xs font-mono uppercase tracking-widest z-50 flex items-center gap-2 border border-emerald-900/40">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Status bar */}
      <div className="px-8 py-3.5 border-b border-[#1A1A1A]/10 bg-[#F4F2EE] flex items-center justify-between font-mono text-[9px] tracking-widest text-[#1A1A1A]/55 font-bold uppercase">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(o => !o)} className={`p-1 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all ${sidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'text-[#1A1A1A]/70'}`}>
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={newChat} className="flex items-center gap-1 px-2 py-1 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] rounded-none transition-all text-[#1A1A1A]/70">
            <Plus className="w-3 h-3" /><span>NEW</span>
          </button>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#1A1A1A]" />
            <span>{lang === 'zh' ? '疆域灵感创意国度' : 'GSYEN Muse Creative Workspace'}</span>
          </div>
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
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            SYSTEM GATEWAY IS ALIVE
          </span>
        </div>
      </div>

      {/* Body: sidebar + chat */}
      <div className="flex-grow flex flex-col md:flex-row min-h-0">

        {/* Sidebar */}
        <aside className={`bg-[#F4F2EE] border-[#1A1A1A]/10 flex flex-col justify-between transition-all duration-300 overflow-hidden shrink-0 ${sidebarOpen ? 'w-full md:w-[320px] p-6 border-r opacity-100' : 'w-0 p-0 border-r-0 opacity-0 pointer-events-none'}`}>
          <div className="flex flex-col h-full min-w-[272px] gap-4">
            <button onClick={() => setRecentsOpen(o => !o)} className="flex items-center justify-between w-full group">
              <h2 className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 group-hover:text-[#1A1A1A] transition-colors">
                {lang === 'zh' ? '往来' : 'Recents'}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-[#1A1A1A]/25">{sessions.length}</span>
                <span className={`text-[#1A1A1A]/30 text-[10px] transition-transform duration-200 ${recentsOpen ? 'rotate-90' : ''}`}>›</span>
              </div>
            </button>

            <div className={`overflow-y-auto space-y-1.5 pr-0.5 transition-all duration-200 ${recentsOpen ? 'flex-1' : 'hidden'}`}>
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
                  <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 hover:text-red-500 text-[#1A1A1A]/30 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 bg-white p-3.5 border border-[#1A1A1A]/10 font-mono text-[9px] uppercase tracking-wider text-neutral-500 shadow-xs shrink-0">
              <div className="inline-flex items-center gap-1.5 text-[#1A1A1A]/60 font-bold">
                <Terminal className="w-3 h-3" />
                {lang === 'zh' ? '本地存储 · Supabase 就绪' : 'LOCAL · SUPABASE READY'}
              </div>
              <p className="text-[8px] text-[#1A1A1A]/40 leading-normal normal-case tracking-normal">
                {lang === 'zh' ? '记录保存于本设备。配置 Supabase 后自动云同步。' : 'Sessions stored locally. Cloud sync activates once Supabase is configured.'}
              </p>
            </div>
          </div>
        </aside>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F9F8F6]">
          <div ref={chatContainerRef} onScroll={() => {
            const el = chatContainerRef.current; if (!el) return;
            isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }} className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">

            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <motion.div key="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                className="h-full flex items-center justify-center px-6">
                <div className="flex flex-col items-center gap-7 w-full max-w-2xl">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 border border-[#1A1A1A]/15 bg-white shadow-sm shrink-0">
                      <VintageCar size={36} strokeWidth={1.5} className="text-[#1A1A1A]/90" />
                    </div>
                    <div className="text-left space-y-1">
                      <h2 className="font-serif-sc text-2xl font-black tracking-[0.12em] text-[#111111] leading-none">{lang === 'zh' ? '疆域灵阁' : 'GSYEN Muse'}</h2>
                      <p className="font-cinzel text-[10px] tracking-[0.22em] text-[#1A1A1A]/45 uppercase">{lang === 'zh' ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}</p>
                    </div>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); handleSend(inputVal); }} className="w-full border border-[#1A1A1A]/20 bg-white focus-within:border-[#1A1A1A]/50 transition-colors">
                    <textarea autoFocus rows={4} value={inputVal} onChange={e => setInputVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(inputVal); } }}
                      placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、视觉创意、符号设计...' : 'Ask Atelier AI anything about brand, design, or strategy...'}
                      className="w-full px-5 pt-5 pb-3 bg-transparent resize-none outline-none font-sans text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 leading-relaxed" />
                    <div className="px-4 pb-3 flex items-center justify-between">
                      <span className="font-mono text-[8px] tracking-widest uppercase text-[#1A1A1A]/25">{lang === 'zh' ? 'ENTER 发送 · SHIFT+ENTER 换行' : 'ENTER TO SEND · SHIFT+ENTER FOR NEW LINE'}</span>
                      <button type="submit" disabled={!inputVal.trim()} className="p-2 bg-[#1A1A1A] text-[#F9F8F6] disabled:bg-[#1A1A1A]/10 disabled:text-[#1A1A1A]/30 transition-colors rounded-none border border-[#1A1A1A] disabled:border-[#1A1A1A]/10">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </form>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {PRESET_QUERIES.map((q, idx) => (
                      <button key={idx} onClick={() => handleSend(lang === 'zh' ? q.zh : q.en)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1A1A1A]/12 bg-white/70 hover:bg-white hover:border-[#1A1A1A]/25 transition-all rounded-none group">
                        <Sparkles className="w-2.5 h-2.5 text-amber-500/60 group-hover:text-amber-500 shrink-0" />
                        <span className="font-mono text-[9px] tracking-widest uppercase text-[#1A1A1A]/55 group-hover:text-[#1A1A1A]">
                          {lang === 'zh' ? PRESET_SHORT_LABELS[idx].zh : PRESET_SHORT_LABELS[idx].en}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Message stream */}
            <AnimatePresence initial={false}>
              {messages.map(msg => {
                const isAI = msg.role === 'model';
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-4 max-w-4xl ${isAI ? '' : 'ml-auto flex-row-reverse'}`}>
                    <div className={`w-8 h-8 flex items-center justify-center border shrink-0 py-1.5 ${isAI ? 'bg-[#1A1A1A] text-[#F9F8F6] border-[#1A1A1A]' : 'bg-[#F4F2EE] text-[#1A1A1A] border-[#1A1A1A]/20'}`}>
                      {isAI ? <Sparkles className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    </div>
                    <div className="space-y-1.5 max-w-[85%]">
                      <div className={`flex items-center gap-2 text-[9px] font-mono tracking-wider uppercase text-neutral-400 ${!isAI ? 'justify-end' : ''}`}>
                        <span className="font-bold text-[#1A1A1A]/70">{isAI ? (lang === 'zh' ? 'Atelier AI' : 'ATELIER AI') : (lang === 'zh' ? '您' : 'CLIENT')}</span>
                        <span>•</span><span>{msg.timestamp}</span>
                      </div>
                      <div className={`p-4 border text-left leading-relaxed shadow-xs ${isAI ? 'bg-white border-[#1A1A1A]/10 text-[#2F2F2F]' : 'bg-[#1A1A1A] text-white border-[#1A1A1A] font-medium'}`}>
                        <div className="space-y-1">{renderMessageContent(msg.content, isAI)}</div>
                        {isAI && (
                          <div className="mt-4 pt-3.5 border-t border-[#1A1A1A]/5 flex items-center justify-end gap-3.5">
                            <button onClick={() => handleCopy(msg.id, msg.content)} className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1">
                              {isCopiedId === msg.id ? <><Check className="w-2.5 h-2.5 text-emerald-600" /><span className="text-emerald-600 font-bold">{lang === 'zh' ? '已复制' : 'COPIED'}</span></> : <><Copy className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '复制' : 'COPY'}</span></>}
                            </button>
                            <button onClick={() => exportQuoteCard(msg, lang)} className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1">
                              <Download className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '灵感卡片' : 'CARD'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-4 max-w-4xl">
                <div className="w-8 h-8 flex items-center justify-center bg-[#1A1A1A] text-[#F9F8F6] border border-[#1A1A1A] shrink-0">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                </div>
                <div className="space-y-1.5 max-w-[85%]">
                  <div className="flex items-center gap-2 text-[9px] font-mono tracking-wider uppercase text-neutral-400">
                    <span className="font-bold text-[#1A1A1A]/70">{lang === 'zh' ? 'AI 正在融汇思绪' : 'AI STUDYING DETAILS'}</span>
                  </div>
                  <div className="p-4 bg-white border border-[#1A1A1A]/10 shadow-xs flex items-center gap-2 text-neutral-400 font-mono text-[10px] uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-neutral-400 animate-ping" />
                    <span>{lang === 'zh' ? '深度推演中...' : 'Formulating creative solutions...'}</span>
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
  );
}
