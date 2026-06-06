/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Custom Premium AI Chat Assistant component following the Atelier minimalist design language.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import VintageCar from './VintageCar';
import {
  Sparkles,
  Send,
  Trash2,
  Copy,
  Check,
  Download,
  Terminal,
  MessageSquare,
  User,
  PanelLeft,
  Plus,
  Clock,
  X
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

interface StoredSession {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  updatedAt: string;
}

interface ChatModuleProps {
  lang: 'zh' | 'en';
}

const PRESET_QUERIES = [
  {
    zh: '帮我设计一个香氛品牌，想五个高雅脱俗的名字及奢华口号',
    en: 'Design a high-end fragrance brand with 5 poetic names & luxury taglines'
  },
  {
    zh: '能帮我规划一份奢雅艺术画廊首展的整周日程看板安排吗？',
    en: 'Schedule a week-long kanban calendar itinerary for a luxury gallery opening'
  },
  {
    zh: '作为一个经典瑞土手工腕表工坊，其品牌核心视觉符号设计有何建议？',
    en: 'What iconic symbol and font parameters suit an elite artisan watchmaker?'
  },
  {
    zh: '如何用复式记账法优雅地记录我的品牌初创资金与流转？',
    en: 'Explain double-entry bookkeeping flow for our creative design workspace'
  }
];

export default function ChatModule({ lang }: ChatModuleProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopiedId, setIsCopiedId] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<'kimi' | 'deepseek' | 'claude' | 'chatgpt' | 'gemini' | 'ethan' | 'fast'>('fast');
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const modelScrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  const onDragStart = (e: React.MouseEvent) => {
    const el = modelScrollRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !modelScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - modelScrollRef.current.offsetLeft;
    modelScrollRef.current.scrollLeft = dragScrollLeft.current - (x - dragStartX.current);
  };
  const onDragEnd = () => {
    isDragging.current = false;
    if (modelScrollRef.current) modelScrollRef.current.style.cursor = 'grab';
  };

  const SESSIONS_KEY = 'gsyen_chat_sessions_v1';

  const loadSessions = (): StoredSession[] => {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
  };

  const persistSessions = (list: StoredSession[]) => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
    setSessions(list);
  };

  const upsertSession = (id: string, msgs: ChatMessage[], model: string) => {
    const firstUser = msgs.find(m => m.role === 'user');
    const title = firstUser ? firstUser.content.slice(0, 36) + (firstUser.content.length > 36 ? '…' : '') : (lang === 'zh' ? '新对话' : 'New chat');
    const existing = loadSessions();
    const idx = existing.findIndex(s => s.id === id);
    const updated: StoredSession = { id, title, model, messages: msgs, updatedAt: new Date().toISOString() };
    if (idx >= 0) existing[idx] = updated; else existing.unshift(updated);
    persistSessions(existing.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  };

  const deleteSession = (id: string) => {
    const updated = loadSessions().filter(s => s.id !== id);
    persistSessions(updated);
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
      localStorage.removeItem('atelier_ai_chat');
    }
  };

  useEffect(() => { setSessions(loadSessions()); }, []);

  const MODELS: { id: string; label: string; disabled?: boolean }[] = [
    { id: 'fast',     label: '疆域·轻' },
    { id: 'ethan',    label: '疆域·思' },
    { id: 'kimi',     label: 'KIMI-K2.5' },
    { id: 'deepseek', label: 'DEEPSEEK' },
    { id: 'claude',   label: 'CLAUDE',   disabled: true },
    { id: 'chatgpt',  label: 'CHATGPT',  disabled: true },
    { id: 'gemini',   label: 'GEMINI',   disabled: true },
  ];
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  // Initialize with introductory greeting message
  useEffect(() => {
    const savedChat = localStorage.getItem('atelier_ai_chat');
    if (savedChat) {
      try {
        setMessages(JSON.parse(savedChat));
      } catch (e) {
        console.error("Failed to parse saved chat logs:", e);
      }
    } else {
      const defaultGreet: ChatMessage = {
        id: 'greet-1',
        role: 'model',
        content: lang === 'zh' 
          ? '欢迎来到 **疆域灵阁 (GSYEN Muse)**。\n\n我是您的智能美学设计与品牌策略助手。在这里，您可以向我咨询品牌艺术命名、高级视觉符号创意、排版色彩推荐及业务流程规划。请在下方输入您的畅想，或选择侧边栏的灵感命题开始：'
          : 'Welcome to the **GSYEN Muse Atelier Workspace**.\n\nI am your digital brand curator and creative consultant. In this retreat, you can query me about elegant naming strategies, luxury visual symbology, type layout concepts, and refined operational metrics. Begin by typing regular inquiries or selecting one of our high-quality catalysts below:',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([defaultGreet]);
    }
  }, [lang]);

  const saveChat = (msgs: ChatMessage[]) => {
    setMessages(msgs);
    localStorage.setItem('atelier_ai_chat', JSON.stringify(msgs));
    if (msgs.some(m => m.role === 'user')) {
      const sid = currentSessionId || `session-${Date.now()}`;
      if (!currentSessionId) setCurrentSessionId(sid);
      upsertSession(sid, msgs, selectedModel);
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 只有用户在底部时才自动滚，往上看时不强制拉回
  useEffect(() => {
    if (isAtBottom.current) scrollToBottom();
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    localStorage.removeItem('atelier_ai_chat');
  };

  const handleClearHistory = () => {
    if (window.confirm(lang === 'zh' ? '确定要抹除所有与 AI 的思绪记录吗？' : 'Are you sure you want to dismiss your session memory?')) {
      const defaultGreet: ChatMessage = {
        id: `greet-${Date.now()}`,
        role: 'model',
        content: lang === 'zh'
          ? '思绪已净化。让我们开启新的品牌探讨。'
          : 'Memory clean. Let us embark on another curated creative journey.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      saveChat([defaultGreet]);
    }
  };

  // 本地预测专家(老陈备货 / 顾客流失)。命中返回答案,否则返回 null 交给通用大模型。
  const PREDICT_API = (import.meta as any).env?.VITE_PREDICT_API || 'http://127.0.0.1:8000';
  const askPredictionExpert = async (text: string): Promise<string | null> => {
    try {
      const r = await fetch(`${PREDICT_API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text })
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d['专家'] && d['专家'] !== '无' ? d.answer : null;
    } catch {
      return null; // 本地服务没开就静默放行,走原来的网关
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMsgs = [...messages, userMsg];
    saveChat(updatedMsgs);
    setInputVal('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMsgs.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) throw new Error('Connection error');

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // ── 流式输出：打字机效果 ──────────────────────────
        const aiMsgId = `ai-${Date.now()}`;
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages([...updatedMsgs, { id: aiMsgId, role: 'model', content: '▍', timestamp }]);

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
              if (delta) {
                // 打字机节奏：逐字渲染，模拟机械敲击感
                for (const char of delta) {
                  fullText += char;
                  setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: fullText + '▍' } : m
                  ));
                  // 不同字符的停顿节奏
                  let delay: number;
                  if ('。！？…'.includes(char)) {
                    delay = 180 + Math.random() * 180; // 句末：180-360ms
                  } else if ('，、；：'.includes(char)) {
                    delay = 60 + Math.random() * 80;  // 句中标点：60-140ms
                  } else if (char === '\n') {
                    delay = 120 + Math.random() * 150; // 换行：120-270ms
                  } else if (Math.random() < 0.04) {
                    delay = 80 + Math.random() * 120;  // 偶发停顿（4%概率）：80-200ms
                  } else {
                    delay = 12 + Math.random() * 18;   // 正常敲击：12-30ms
                  }
                  await new Promise(r => setTimeout(r, delay));
                }
              }
            } catch {}
          }
        }
        // 流结束，去掉光标，持久化
        const finalMsg: ChatMessage = { id: aiMsgId, role: 'model', content: fullText || '…', timestamp };
        saveChat([...updatedMsgs, finalMsg]);

      } else {
        // ── 非流式（兜底）────────────────────────────────
        const data = await response.json();
        const aiReply = data.text || (lang === 'zh' ? '抱歉，未返回有效回复。' : 'Empty response.');
        saveChat([...updatedMsgs, {
          id: `ai-${Date.now()}`, role: 'model', content: aiReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }

    } catch (err) {
      console.error("AI Communication error:", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: lang === 'zh'
          ? '⚠️ **通讯失败**：模型响应超时或连接中断，请稍后重试。'
          : '⚠️ **Connection Failed**: Model timed out or connection was interrupted. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      saveChat([...updatedMsgs, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopiedId(id);
    setTimeout(() => {
      setIsCopiedId(null);
    }, 2000);
  };

  const handleSaveQuoteCard = (msg: ChatMessage) => {
    // Generate simple exquisite styling card download
    const title = lang === 'zh' ? 'Atelier 灵感记录' : 'Atelier Curated Log';
    const metadata = `TIME: ${msg.timestamp} | ASSISTANT VER. 2.5`;
    const cleanContent = msg.content;
    
    const formattedHtml = `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              background-color: #F9F8F6;
              color: #1A1A1A;
              font-family: 'Playfair Display', Georgia, serif;
              padding: 40px;
              max-width: 600px;
              margin: 40px auto;
              border: 1px solid #1A1A1A;
              box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            }
            h1 {
              font-size: 18px;
              border-bottom: 1px solid rgba(26,26,26,0.1);
              padding-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              font-family: inherit;
            }
            .meta {
              font-family: monospace;
              font-size: 9px;
              color: rgba(26,26,26,0.5);
              margin-bottom: 20px;
              text-transform: uppercase;
              letter-spacing: 0.15em;
            }
            .content {
              font-size: 14px;
              line-height: 1.6;
              white-space: pre-wrap;
              color: #2F2F2F;
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">${metadata}</div>
          <div class="content">${cleanContent}</div>
        </body>
      </html>
    `;
    
    const blob = new Blob([formattedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `atelier-brand-inspiration-${msg.id}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pre-process formatted markdown bolding and lists natively
  const renderMessageContent = (text: string, isAI: boolean) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // 1. Bullet list
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const cleanText = line.trim().substring(2);
        return (
          <li key={i} className={`list-disc list-inside ml-2.5 my-1.5 font-sans leading-relaxed text-xs ${isAI ? 'text-[#2F2F2F]' : 'text-white/90'}`}>
            {parseBoldText(cleanText, isAI)}
          </li>
        );
      }
      // 2. Numeric list
      const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        return (
          <div key={i} className={`ml-3 my-1.5 flex gap-2 font-sans text-xs leading-relaxed ${isAI ? 'text-[#2F2F2F]' : 'text-white/95'}`}>
            <span className={`font-mono font-bold ${isAI ? 'text-[#1A1A1A]' : 'text-[#F9F8F6]'}`}>{numMatch[1]}.</span>
            <span className="flex-1">{parseBoldText(numMatch[2], isAI)}</span>
          </div>
        );
      }
      // 3. Header formatting
      if (line.trim().startsWith('### ')) {
        return (
          <h4 key={i} className={`text-xs font-mono font-bold uppercase tracking-wider mt-4 mb-2 ${isAI ? 'text-[#1A1A1A]' : 'text-white'}`}>
            {line.trim().substring(4)}
          </h4>
        );
      }
      if (line.trim().startsWith('## ')) {
        return (
          <h3 key={i} className={`text-sm font-serif font-bold italic mt-5 mb-2.5 ${isAI ? 'text-[#1A1A1A]' : 'text-[#F9F8F6]'}`}>
            {line.trim().substring(3)}
          </h3>
        );
      }
      // 4. Standard paragraph
      if (line.trim() === '') {
        return <div key={i} className="h-2.5" />;
      }
      return (
        <p key={i} className={`leading-relaxed font-sans text-xs my-1 ${isAI ? 'text-[#2F2F2F]' : 'text-white'}`}>
          {parseBoldText(line, isAI)}
        </p>
      );
    });
  };

  const parseBoldText = (text: string, isAI: boolean) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    if (parts.length === 1) return text;
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className={`font-bold font-sans ${isAI ? 'text-[#1A1A1A]' : 'text-white font-black'}`}>{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F9F8F6]" id="ai-chat-root-workspace">
      {/* Upper Status Line */}
      <div className="px-8 py-3.5 border-b border-[#1A1A1A]/10 bg-[#F4F2EE] flex items-center justify-between font-mono text-[9px] tracking-widest text-[#1A1A1A]/55 font-bold uppercase text-nowrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all flex items-center justify-center ${sidebarOpen ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]' : 'bg-transparent text-[#1A1A1A]/70'}`}
            title={lang === 'zh' ? '切换侧边栏' : 'Toggle Sidebar'}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 px-2 py-1 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] rounded-none transition-all text-[#1A1A1A]/70 text-[9px] font-mono font-bold tracking-widest uppercase"
            title={lang === 'zh' ? '新建对话' : 'New Chat'}
          >
            <Plus className="w-3 h-3" />
            <span>NEW</span>
          </button>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#1A1A1A]" />
            <span>{lang === 'zh' ? '疆域灵感创意国度' : 'GSYEN Muse Creative Workspace'}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">MODEL:</span>
            <div
              ref={modelScrollRef}
              onMouseDown={onDragStart}
              onMouseMove={onDragMove}
              onMouseUp={onDragEnd}
              onMouseLeave={onDragEnd}
              className="flex bg-[#1A1A1A]/5 p-0.5 border border-[#1A1A1A]/10 overflow-x-scroll select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ maxWidth: '224px', cursor: 'grab' }}
            >
              {MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => !m.disabled && setSelectedModel(m.id as 'kimi' | 'deepseek')}
                  disabled={m.disabled}
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold tracking-widest uppercase transition-all rounded-none shrink-0 ${
                    m.disabled
                      ? 'text-[#1A1A1A]/20 cursor-not-allowed'
                      : selectedModel === m.id
                        ? 'bg-[#1A1A1A] text-[#F9F8F6]'
                        : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${serverOnline ? 'bg-emerald-600 animate-pulse' : 'bg-red-500'}`} />
            {serverOnline ? 'SYSTEM GATEWAY IS ALIVE' : 'GATEWAY STATUS UNSTABLE'}
          </span>
        </div>
      </div>

      {/* Main chat window split: Left side query grid / suggestions, right side chat streams */}
      <div className="flex-grow flex flex-col md:flex-row min-h-0">
        
        {/* Suggetions Sidebar Panel */}
        <aside 
          className={`bg-[#F4F2EE] border-[#1A1A1A]/10 flex flex-col justify-between transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
            sidebarOpen 
              ? 'w-full md:w-[320px] p-6 border-r opacity-100' 
              : 'w-0 md:w-0 p-0 border-r-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex flex-col h-full min-w-[272px] gap-4">

            {/* Header — collapsible */}
            <button
              onClick={() => setRecentsOpen(o => !o)}
              className="flex items-center justify-between w-full group"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 group-hover:text-[#1A1A1A] transition-colors">
                  {lang === 'zh' ? '往来' : 'Recents'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase tracking-wider">
                  {sessions.length}
                </span>
                <span className={`text-[#1A1A1A]/30 transition-transform duration-200 text-[10px] ${recentsOpen ? 'rotate-90' : ''}`}>›</span>
              </div>
            </button>

            {/* Session list */}
            <div className={`overflow-y-auto space-y-1.5 pr-0.5 transition-all duration-200 ${recentsOpen ? 'flex-1' : 'hidden'}`}>
              {sessions.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <MessageSquare className="w-6 h-6 text-[#1A1A1A]/15 mx-auto" />
                  <p className="text-[9px] font-mono text-[#1A1A1A]/30 uppercase tracking-widest">
                    {lang === 'zh' ? '暂无记录' : 'No history yet'}
                  </p>
                </div>
              ) : sessions.map(s => (
                <div
                  key={s.id}
                  className={`group relative flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${
                    currentSessionId === s.id
                      ? 'border-[#1A1A1A]/30 bg-white shadow-xs'
                      : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'
                  }`}
                  onClick={() => {
                    setCurrentSessionId(s.id);
                    setMessages(s.messages);
                    localStorage.setItem('atelier_ai_chat', JSON.stringify(s.messages));
                  }}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2">
                      {s.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-[#1A1A1A]/30 uppercase tracking-wider">
                        {new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase tracking-wider">
                        {s.model}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 hover:text-red-500 text-[#1A1A1A]/30 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer info */}
            <div className="space-y-1.5 bg-white p-3.5 border border-[#1A1A1A]/10 font-mono text-[9px] uppercase tracking-wider text-neutral-500 leading-relaxed shadow-xs shrink-0">
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

        {/* Chat log visual streams (Right panel) */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F9F8F6]">
          {/* Messages Flow Area */}
          <div
            ref={chatContainerRef}
            onScroll={() => {
              const el = chatContainerRef.current;
              if (!el) return;
              isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
            className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6"
          >

            {/* ── Empty state: centered hero input ── */}
            {messages.length === 0 && !isLoading && (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="h-full flex items-center justify-center px-6"
              >
                <div className="flex flex-col items-center gap-7 w-full max-w-2xl">

                  {/* Logo + Brand */}
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 border border-[#1A1A1A]/15 bg-white shadow-[1px_1px_0px_rgba(26,26,26,0.06)] shrink-0">
                      <VintageCar size={36} strokeWidth={1.5} className="text-[#1A1A1A]/90" />
                    </div>
                    <div className="text-left space-y-1">
                      <h2 className="font-serif-sc text-2xl font-black tracking-[0.12em] text-[#111111] leading-none">
                        {lang === 'zh' ? '疆域灵阁' : 'GSYEN Muse'}
                      </h2>
                      <p className="font-cinzel text-[10px] tracking-[0.22em] text-[#1A1A1A]/45 uppercase">
                        {lang === 'zh' ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}
                      </p>
                    </div>
                  </div>

                  {/* Hero input box */}
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputVal); }}
                    className="w-full border border-[#1A1A1A]/20 bg-white shadow-[1px_1px_0px_rgba(26,26,26,0.04)] focus-within:border-[#1A1A1A]/50 transition-colors"
                  >
                    <textarea
                      autoFocus
                      rows={4}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(inputVal);
                        }
                      }}
                      placeholder={lang === 'zh'
                        ? '向 Atelier AI 咨询任何品牌策划、视觉创意、符号设计...'
                        : 'Ask Atelier AI anything about brand, design, or strategy...'}
                      className="w-full px-5 pt-5 pb-3 bg-transparent resize-none outline-none font-sans text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 leading-relaxed"
                    />
                    <div className="px-4 pb-3 flex items-center justify-between">
                      <span className="font-mono text-[8px] tracking-widest uppercase text-[#1A1A1A]/25">
                        {lang === 'zh' ? 'ENTER 发送 · SHIFT+ENTER 换行' : 'ENTER TO SEND · SHIFT+ENTER FOR NEW LINE'}
                      </span>
                      <button
                        type="submit"
                        disabled={!inputVal.trim()}
                        className="p-2 bg-[#1A1A1A] text-[#F9F8F6] disabled:bg-[#1A1A1A]/10 disabled:text-[#1A1A1A]/30 transition-colors rounded-none border border-[#1A1A1A] disabled:border-[#1A1A1A]/10"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </form>

                  {/* Preset chips — horizontal row */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {PRESET_QUERIES.map((q, idx) => {
                      const text = lang === 'zh' ? q.zh : q.en;
                      const shortLabel = lang === 'zh'
                        ? ['品牌命名', '日程规划', '符号设计', '财务记账'][idx]
                        : ['Brand Name', 'Schedule', 'Symbol', 'Finance'][idx];
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(text)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1A1A1A]/12 bg-white/70 hover:bg-white hover:border-[#1A1A1A]/25 transition-all rounded-none group"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-amber-500/60 group-hover:text-amber-500 transition-colors shrink-0" />
                          <span className="font-mono text-[9px] tracking-widest uppercase text-[#1A1A1A]/55 group-hover:text-[#1A1A1A] transition-colors">
                            {shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isAI = msg.role === 'model';
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-4 max-w-4xl ${isAI ? '' : 'ml-auto flex-row-reverse'}`}
                  >
                    {/* Character Avatar */}
                    <div className={`w-8 h-8 flex items-center justify-center border shrink-0 py-1.5 ${
                      isAI 
                        ? 'bg-[#1A1A1A] text-[#F9F8F6] border-[#1A1A1A]' 
                        : 'bg-[#F4F2EE] text-[#1A1A1A] border-[#1A1A1A]/20'
                    }`}>
                      {isAI ? <Sparkles className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    </div>

                    {/* Chat Box Container */}
                    <div className="space-y-1.5 max-w-[85%]">
                      {/* Name & Time */}
                      <div className={`flex items-center gap-2 text-[9px] font-mono tracking-wider uppercase text-neutral-400 ${!isAI ? 'justify-end' : ''}`}>
                        <span className="font-bold text-[#1A1A1A]/70">{isAI ? (lang === 'zh' ? 'Atelier AI' : 'ATELIER AI') : (lang === 'zh' ? '您' : 'CLIENT')}</span>
                        <span>•</span>
                        <span>{msg.timestamp}</span>
                      </div>

                      {/* Content Bubble formatted */}
                      <div className={`p-4 border text-left leading-relaxed shadow-xs ${
                        isAI 
                          ? 'bg-white border-[#1A1A1A]/10 text-[#2F2F2F]' 
                          : 'bg-[#1A1A1A] text-white border-[#1A1A1A] font-medium'
                      }`}>
                        <div className="space-y-1">
                          {renderMessageContent(msg.content, isAI)}
                        </div>

                        {/* Action buttons footer inside AI bubble only */}
                        {isAI && (
                          <div className="mt-4 pt-3.5 border-t border-[#1A1A1A]/5 flex items-center justify-end gap-3.5">
                            <button
                              onClick={() => handleCopyText(msg.id, msg.content)}
                              className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1 focus:outline-none"
                              title={lang === 'zh' ? '复制文体' : 'Copy contents'}
                            >
                              {isCopiedId === msg.id ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-600 font-bold">{lang === 'zh' ? '已复制' : 'COPIED'}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5" />
                                  <span>{lang === 'zh' ? '复制' : 'COPY'}</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleSaveQuoteCard(msg)}
                              className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1 focus:outline-none"
                              title={lang === 'zh' ? '下载精品灵感卡片' : 'Download Quote Card'}
                            >
                              <Download className="w-2.5 h-2.5" />
                              <span>{lang === 'zh' ? '灵感卡片' : 'CARD'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Simulated typing loading indicators */}
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

          {/* Interactive input bar — hidden on empty state */}
          <div className={`shrink-0 p-4 border-t border-[#1A1A1A]/10 bg-white ${messages.length === 0 ? 'hidden' : ''}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputVal);
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-3 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition-colors text-neutral-500 rounded-none focus:outline-none shrink-0"
                title={lang === 'zh' ? '清空历史聊天记录' : 'Wipe all history logs'}
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <input
                id="ai-thought-input"
                type="text"
                placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、符号创意、日程安排吧...' : 'Ask Atelier AI anything about your luxurious brand, design patterns, or schedules...'}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="flex-grow p-3 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white rounded-none outline-none font-sans text-xs text-[#1A1A1A]"
              />

              <button
                type="submit"
                disabled={!inputVal.trim()}
                className="p-3 bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/95 disabled:bg-[#1A1A1A]/10 disabled:text-neutral-300 transition-colors rounded-none focus:outline-none shrink-0 border border-[#1A1A1A]"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
