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
import MailCardExpand from './MailCardExpand';
import {
  Sparkles, Send, Trash2, Copy, Check,
  Download, Terminal, MessageSquare, User,
  PanelLeft, Plus, X,
} from 'lucide-react';

import { ChatMessage, ActionCard } from '../types/chat';
import { ModelId, MODELS } from '../config/models';
import { PRESET_QUERIES, PRESET_SHORT_LABELS } from '../config/presets';
import { useChatSession } from '../hooks/useChatSession';
import { useChatStream } from '../hooks/useChatStream';
import { renderMessageContent } from '../utils/renderMessage';
import { exportQuoteCard } from '../utils/exportCard';

// ── 神机百炼 · 操作卡片 ────────────────────────────────────────────────────────
// 深色基调，呼应用户气泡（bg-[#1A1A1A]）与 `>` 引用块的暗色细节语言
const MODULE_COLOR: Record<string, string> = {
  CHRONOS: 'text-amber-400',
  LEDGER:  'text-teal-400',
  MAIL:    'text-sky-400',
  VAULT:   'text-rose-400',
  CANVAS:  'text-emerald-400',
};
const ACTION_LABEL_ZH: Record<string, string> = {
  create: '已建立', update: '已更新', delete: '已删除', query: '今日日程',
};
const ACTION_LABEL_EN: Record<string, string> = {
  create: 'CREATED', update: 'UPDATED', delete: 'DELETED', query: 'TODAY',
};

function ActionCardView({ card, lang }: { card: ActionCard; lang: 'zh' | 'en' }) {
  const isDeleted = card.action === 'delete';
  const statusLabel = lang === 'zh'
    ? ACTION_LABEL_ZH[card.action] ?? ''
    : ACTION_LABEL_EN[card.action] ?? '';

  const meta = card.meta.filter(Boolean);
  const isLedger = card.module === 'LEDGER';

  // LEDGER: meta[0]=金额(±N), meta[1]=日期, meta[2]=category — focus列只显示金额，其余全进右侧标签
  // CHRONOS: meta[0]="2026-06-08 · 15:00" — 转换 12h 制时间作 focusText，日期作 focusSub
  let focusText = meta[0] ?? card.title;
  let focusSub  = meta[1] ?? '';
  let tags      = meta.slice(2);

  if (isLedger) {
    focusText = meta[0] ?? '';   // ±金额
    focusSub  = '';              // 不在 focus 列显示日期
    tags      = meta.slice(1);  // 日期 + category 进右侧小标签
  } else {
    const dtMatch = (meta[0] ?? '').match(/(\d{4}-)?(\d{2}-\d{2})\s*[·•]\s*(\d{1,2}):(\d{2})/);
    if (dtMatch) {
      const [, , md, hh, mm] = dtMatch;
      const h = parseInt(hh, 10);
      const h12 = ((h + 11) % 12) + 1;
      focusText = `${String(h12).padStart(2, '0')}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
      focusSub  = meta[1] ? `${md} · ${meta[1]}` : md;
      tags      = meta.slice(2);
    }
  }

  // scope 由内容语义判定（含团队/客户/对方等"涉及他人"关键词 → shared，否则 self）
  // 全局仅用两色，不分类目：仅自己=暗橄榄绿 #4C5236，涉及他人=暗紫灰 #6B5673
  const isShared = /团队|客户|经理|对方|共享|协作|分成|开会|对外/.test(card.title + meta.join(''));
  const COLOR = isShared
    ? { focus: 'bg-[#6B5673]', body: 'bg-[#564459]' }
    : { focus: 'bg-[#4C5236]', body: 'bg-[#3A3F29]' };

  const isMail = card.module === 'MAIL';
  const [mailOpen, setMailOpen] = useState(false);

  return (
    <div className="mt-3 select-none">
      <div
        onClick={() => isMail && setMailOpen(o => !o)}
        className={`rounded-xl border border-white/[0.05] ${COLOR.body} overflow-hidden flex transition ${isMail ? 'cursor-pointer hover:brightness-110' : ''}`}
      >
        <div className={`flex flex-col items-center justify-center ${COLOR.focus} shrink-0 overflow-hidden px-3 py-3 w-[148px]`}>
          <span className={`font-mono font-bold leading-none tracking-tight truncate text-center w-full text-[14px] ${
            isLedger
              ? focusText.startsWith('+') ? 'text-teal-400' : 'text-rose-400'
              : 'text-amber-400/90'
          }`}>{focusText}</span>
          {focusSub && <span className="font-mono text-[8px] text-white/30 mt-1.5 tracking-wide truncate text-center w-full">{focusSub}</span>}
        </div>
        <div className="flex-1 min-w-0 px-3.5 py-2.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-mono text-[8px] tracking-[0.18em] font-bold uppercase truncate ${MODULE_COLOR[card.module] ?? 'text-white/50'}`}>{card.module}</span>
            <span className="font-mono text-[8px] tracking-widest text-white/30 uppercase shrink-0">{statusLabel}</span>
          </div>
          <p className={`font-sans font-semibold leading-snug truncate text-[13px] ${isDeleted ? 'text-white/40 line-through' : 'text-white/90'}`}>{card.title}</p>
          {tags.length > 0 && (
            <div className="flex items-center gap-2 pt-0.5">
              {tags.map((tag, i) => (
                <span key={i} className="font-mono text-[9px] text-white/35 px-1.5 py-0.5 rounded bg-white/[0.04] truncate">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {isMail && mailOpen && (
        <MailCardExpand
          recipient={focusText !== card.title ? focusText : ''}
          subject={card.title}
          onClose={() => setMailOpen(false)}
        />
      )}
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────────

interface ChatModuleProps { lang: 'zh' | 'en' }

export default function ChatModule({ lang }: ChatModuleProps) {
  const [inputVal, setInputVal]       = useState('');
  const [isCopiedId, setIsCopiedId]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelId>('ethan');
  const [toast, setToast]             = useState<string | null>(null);

  const { messages, sessions, currentSessionId, setMessages, saveChat, loadSession, deleteSession, newChat } =
    useChatSession(lang);
  const { isLoading, send } = useChatStream();
  const pendingCard = useRef<ActionCard | null>(null);

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
                    className={`flex gap-3 max-w-3xl ${isAI ? '' : 'ml-auto flex-row-reverse'}`}>
                    {/* 头像 */}
                    <div className={`w-7 h-7 flex items-center justify-center shrink-0 mt-1 ${isAI ? 'rounded-full bg-[#1A1A1A] text-[#F9F8F6]' : 'rounded-full bg-[#E8E6E1] text-[#1A1A1A]'}`}>
                      {isAI ? <Sparkles className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    </div>
                    <div className="space-y-1 max-w-[88%]">
                      <div className={`flex items-center gap-1.5 text-[9px] font-mono tracking-wider uppercase text-neutral-400 ${!isAI ? 'justify-end' : ''}`}>
                        <span className="font-bold text-[#1A1A1A]/50">{isAI ? (lang === 'zh' ? 'Atelier AI' : 'ATELIER AI') : (lang === 'zh' ? '您' : 'CLIENT')}</span>
                        <span>·</span><span>{msg.timestamp}</span>
                      </div>
                      <div className={`text-left leading-relaxed ${isAI ? 'pt-0.5' : 'px-5 py-3.5 bg-[#1A1A1A] text-white rounded-2xl rounded-tr-none shadow-sm font-medium'}`}>
                        <div className="space-y-1">{renderMessageContent(msg.content, isAI)}</div>
                        {isAI && msg.card && <ActionCardView card={msg.card} lang={lang} />}
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
  );
}
