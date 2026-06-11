/**
 * KanbanChatPanel — 嵌入在 KanbanModule 底部的聊天层
 * 纯展示，状态由 KanbanModule 管理并传入。
 */
import React, { useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { Sparkles, Send, Trash2 } from 'lucide-react';
import { ChatMessage } from '../types/chat';
import { ChatMessageBubble } from './ChatMessageBubble';

interface KanbanChatPanelProps {
  lang: 'zh' | 'en';
  messages: ChatMessage[];
  isLoading: boolean;
  inputVal: string;
  setInputVal: (v: string) => void;
  onSend: (text: string) => void;
  onClear: () => void;
}

export function KanbanChatPanel({
  lang, messages, isLoading, inputVal, setInputVal, onSend, onClear,
}: KanbanChatPanelProps) {
  const chatEndRef       = useRef<HTMLDivElement>(null);
  const containerRef     = useRef<HTMLDivElement>(null);
  const isAtBottom       = useRef(true);

  useEffect(() => {
    if (isAtBottom.current) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const visibleMessages = messages.filter(m => !(m.role === 'model' && m.content === ''));

  return (
    <div className="flex flex-col border-t border-[#1A1A1A]/10 bg-[#F9F8F6]" style={{ height: 340, minHeight: 0 }}>

      {/* Messages scroll */}
      <div ref={containerRef} onScroll={() => {
        const el = containerRef.current; if (!el) return;
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">

        {visibleMessages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] font-mono text-[#1A1A1A]/25 uppercase tracking-widest">
              {lang === 'zh' ? '选择往来记录 或 直接输入开始对话' : 'Select a session or start typing'}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {visibleMessages.map(msg => (
            <ChatMessageBubble key={msg.id} msg={msg} lang={lang} isCopiedId={null} onCopy={() => {}} />
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex gap-3 max-w-3xl">
            <div className="w-7 h-7 flex items-center justify-center rounded-full bg-[#1A1A1A] text-[#F9F8F6] shrink-0 mt-1">
              <Sparkles className="w-3 h-3" />
            </div>
            <div className="pt-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-[#1A1A1A]/10 bg-white px-4 py-2.5">
        <form onSubmit={e => { e.preventDefault(); onSend(inputVal); }} className="flex items-center gap-2">
          <button type="button" onClick={onClear}
            className="p-2.5 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition-colors text-neutral-400 shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
          <input type="text"
            value={inputVal} onChange={e => setInputVal(e.target.value)}
            placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、符号创意、日程安排吧...' : 'Ask Atelier AI anything...'}
            className="flex-1 p-2.5 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white outline-none text-xs text-[#1A1A1A]" />
          <button type="submit" disabled={!inputVal.trim() || isLoading}
            className="p-2.5 bg-[#1A1A1A] text-white disabled:bg-[#1A1A1A]/10 disabled:text-neutral-300 transition-colors shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
