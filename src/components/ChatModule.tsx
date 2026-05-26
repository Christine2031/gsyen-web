/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Custom Premium AI Chat Assistant component following the Atelier minimalist design language.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Send, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  Terminal, 
  Cpu, 
  Zap, 
  MessageSquare, 
  User, 
  Compass, 
  Bookmark, 
  Minimize2,
  RefreshCw,
  PanelLeft
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
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
  const [selectedModel, setSelectedModel] = useState<'kimi' | 'deepseek'>('kimi');

  const MODEL_LABELS: Record<'kimi' | 'deepseek', string> = {
    kimi:     'KIMI-K2.5',
    deepseek: 'DEEPSEEK',
  };
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Sync messages with localStroage
  const saveChat = (msgs: ChatMessage[]) => {
    setMessages(msgs);
    localStorage.setItem('atelier_ai_chat', JSON.stringify(msgs));
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMsgs.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Connection error');
      }

      const data = await response.json();
      const aiReply = data.text || (lang === 'zh' ? '抱歉，本地服务器未返回有效回复。' : 'Pardon me, the local node returned an empty response.');

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        content: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      saveChat([...updatedMsgs, aiMsg]);
    } catch (err) {
      console.error("AI Communication error:", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: lang === 'zh'
          ? '⚠️ **通讯失败**：无法访问后端的智脑网关。请确保运行在 full-stack Express 环境下且存在有效的 `MOONSHOT_API_KEY` 密钥。'
          : '⚠️ **Intel Network Failure**: Could not synchronize variables with the server-side proxy. Confirm full-stack Express is responsive and your `MOONSHOT_API_KEY` is loaded.',
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
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#1A1A1A]" />
            <span>{lang === 'zh' ? '疆域灵阁创意阁度' : 'GSYEN Muse Creative Workspace'}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">MODEL:</span>
            <div className="flex bg-[#1A1A1A]/5 p-0.5 border border-[#1A1A1A]/10">
              {(Object.keys(MODEL_LABELS) as Array<'kimi' | 'deepseek'>).map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedModel(m)}
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold tracking-widest uppercase transition-all rounded-none ${
                    selectedModel === m
                      ? 'bg-[#1A1A1A] text-[#F9F8F6]'
                      : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
                  }`}
                >
                  {MODEL_LABELS[m]}
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
          <div className="space-y-6 flex flex-col justify-between h-full min-w-[272px]">
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-xs font-serif font-bold italic text-[#1A1A1A]">
                  {lang === 'zh' ? '设计创意灵感命题' : 'Curated Creative Prompts'}
                </h2>
                <p className="text-[9.5px] font-mono text-neutral-400 uppercase tracking-widest leading-relaxed">
                  {lang === 'zh' ? '点击下方命题，一键递交 ChatGPT 智脑进行全盘策划与美学推演。' : 'Click a preset prompt below to trigger the intelligent brand curatorial process.'}
                </p>
              </div>

              <div className="space-y-2.5">
                {PRESET_QUERIES.map((q, idx) => {
                  const text = lang === 'zh' ? q.zh : q.en;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputVal(text);
                        handleSendMessage(text);
                      }}
                      disabled={isLoading}
                      className="w-full text-left p-3.5 border border-[#1A1A1A]/10 bg-white/40 hover:bg-white hover:shadow-sm transition-all focus:outline-none rounded-none text-xs text-[#2F2F2F] leading-snug font-sans group relative"
                    >
                      <div className="flex gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="font-sans line-clamp-3">{text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 bg-white p-4 border border-[#1A1A1A]/10 font-mono text-[9px] uppercase tracking-wider text-neutral-500 leading-relaxed shadow-xs">
              <div className="font-serif italic font-bold text-xs text-[#1A1A1A] capitalize mb-1 inline-flex items-center gap-1.5 uppercase font-bold tracking-normal">
                <Terminal className="w-3.5 h-3.5 text-[#1A1A1A]" />
                {lang === 'zh' ? '特调参数反馈' : 'Feedback Loop'}
              </div>
              <p className="text-[8.5px] text-[#1A1A1A]/60 leading-normal">
                {lang === 'zh'
                  ? 'AI 助手完全适配本套艺术工坊的主题配色、古典字体配置及排布几何规范。'
                  : 'The smart core is primed to respect Ateliers bespoke metadata, including fonts and geometric badges.'}
              </p>
            </div>
          </div>
        </aside>

        {/* Chat log visual streams (Right panel) */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#F9F8F6]">
          {/* Messages Flow Area */}
          <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">
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

          {/* Interactive input bar form */}
          <div className="p-4 border-t border-[#1A1A1A]/10 bg-white">
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
                disabled={isLoading}
                placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、符号创意、日程安排吧...' : 'Ask Atelier AI anything about your luxurious brand, design patterns, or schedules...'}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="flex-grow p-3 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white rounded-none outline-none font-sans text-xs text-[#1A1A1A] disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={isLoading || !inputVal.trim()}
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
