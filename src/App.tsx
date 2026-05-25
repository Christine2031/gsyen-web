import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Moon, Sun, Globe, SquarePen, Search, Folder, Terminal, Code2, BookOpen, MessageSquare, CalendarRange, Mail, Copy, ThumbsUp, ThumbsDown, RotateCcw, Check, PanelLeft } from "lucide-react";

// Trello-style kanban icon — two cards (left tall, right short) inside a rounded square
const TrelloBoard = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="21" height="21" rx="4" stroke="currentColor" strokeWidth="2" />
    <rect x="5"   y="5"   width="6"  height="11" rx="1.5" fill="currentColor" />
    <rect x="13"  y="5"   width="6"  height="6.5" rx="1.5" fill="currentColor" />
  </svg>
);
import { ChatMessage } from "./types";
import { auth, apiFetch, supabase } from "./lib/auth";

import KanbanView from "./components/KanbanView";
import CalendarView from "./components/CalendarView";
import EmailView from "./components/EmailView";
import HalfsphereModal from "./components/HalfsphereModal";
import ChatInput from "./components/ChatInput";

interface ProjectItem {
  id: string;
  name: { zh: string; en: string };
  prompt: { zh: string; en: string };
  category: { zh: string; en: string };
}

const SIDEBAR_PROJECTS: ProjectItem[] = [
  {
    id: "camel_case",
    name: {
      zh: "驼峰命名转换器项目",
      en: "camelCase Converter Project"
    },
    prompt: {
      zh: "你好！我需要你帮我写一个高质量的高性能 TypeScript 驼峰命名转换函数。支持将任何下划线分词（snake_case）或中划线分词（kebab-case）格式的字符串、甚至是嵌套的 JSON 对象的所有 key，一键转换为驼峰（camelCase）格式。写好后请用 Markdown 代码块展示，并写出完备的基础单测用例来验证其准确性。",
      en: "Hello! Please help me write a high-performance TypeScript camelCase converter function. It should be capable of deeply converting flat strings or nested JSON keys from snake_case/kebab-case to camelCase. Please provide a clear implementation with complete unit test assertions using markdown code blocks."
    },
    category: {
      zh: "算法模块",
      en: "Algorithm"
    }
  },
  {
    id: "sandbox_api",
    name: {
      zh: "API 手册说明开发",
      en: "API Documentation Guide"
    },
    prompt: {
      zh: "请帮我为当前搭建的全栈 ChatGPT 极简系统设计一份详尽的中英文 API 手册文档。详细描述 `/api/chat/stream` 接口的输入参数（messages, model）、服务器发送事件（SSE）的数据返回格式、错误响应、网关状态以及前端是如何通过 ReadableStream 实时解析 SSE 数据流的。请用优雅、清晰的 Markdown 格式输出排版。",
      en: "Please compile a detailed markdown guide documenting our full-stack chat endpoint `/api/chat/stream`. Detail the expected input parameters (messages, model), the SSE output schema (data chunks for raw text, status feedback, errors), and explain how front-end systems consume the stream efficiently. Follow beautiful markdown rules."
    },
    category: {
      zh: "系统设计",
      en: "Docs"
    }
  },
  {
    id: "todo_list",
    name: {
      zh: "React 极简代办组件",
      en: "React Minimalist Todo Component"
    },
    prompt: {
      zh: "我想用 React + Tailwind CSS 编写一个极其漂亮、流畅的 Todo List 代办事项组件。具备：1. 支持新增、勾选完成和彻底删除；2. 具有微动效动画；3. 支持 localStorage 本地缓存。请提供可直接运行的 JSX 代码并包含完整的 Tailwind 类，外观整洁且具备科技感设计。",
      en: "Help me assemble a beautifully optimized React client-side Todo List component decorated with premium Tailwind CSS styling. Requirements: 1. Complete item CRUD cycle; 2. Micro animations & hover scales; 3. Standard localStorage auto persistence. Write code within an elegant, high-contrast visual display format."
    },
    category: {
      zh: "核心视图",
      en: "UI Component"
    }
  },
  {
    id: "stats_calc",
    name: {
      zh: "JSON 数据聚合分析程序",
      en: "JSON Database Stats Analyzer"
    },
    prompt: {
      zh: "我这里有一些历史运行任务的 JSON 数据记录。我需要用 JavaScript 写一个高效的统计分析程序。功能要求包括：提取其中 active 状态的记录，计算高分数值、平均分数、按类别进行 group-by 分组统计、并返回最终的聚合 JSON 对象。请使用优雅的现代 ES6 语法编写并携带注释说明。",
      en: "Write an optimized JavaScript logic utility to analyze a series of structured JSON records. The logic must filter for rows flagged as active, compute calculations (high score, mean score), perform an efficient group-by aggregation sorting by categories, and return the aggregated results. Follow immaculate ES6 styling."
    },
    category: {
      zh: "统计套件",
      en: "Analysis"
    }
  }
];

const LOCALES = {
  zh: {
    modelGemini: "DeepSeek V3",
    modelKimi: "Kimi 2.6",
    newChat: "新建会话",
    userLabel: "用户",
    agentLabel: "疆域智能",
    inputPlaceholder: "输入您的任何问题... (支持 Shift + Enter 换行)",
    welcomeMessage: "你好！我是「疆域 gsyen」AI 智能体助手。一个专为您深度定制的极简、高流畅度、护眼排版的极速对话交互流。\n\n您可以随时从左侧侧边栏中点选特定的【开发项目与任务】来体验自动化提示词生成，或者在下方键盘输入框内直接向我提问。代码与排版已通过高标准中英文字体库优化，提供纸张般温润的阅读体验。",
    errorMessage: "发生错误，请重试。",
    apiKeyWarning: "安全提醒: 本应用基于 Google Cloud 服务运行。请在顶部 Settings > Secrets 中配置您的 GEMINI_API_KEY 以开始高精度对话。",
    searchPlaceholder: "检索预设开发项目...",
    projectsHeader: "疆域预设项目列表",
    sidebarLogo: "疆域 gsyen",
    noProjectFound: "未搜索到相关的项目",
    systemPromptHint: "轻点加载该开发项目提示词",
    workspaceHeader: "协同办公空间",
    navChat: "智能 AI 助手",
    navKanban: "研发协同看板",
    navCalendar: "研发排期日历",
    navEmail: "疆域收发邮件",
    hsLinked: "已绑定 HalfSphere",
    hsUnlinked: "连接 HalfSphere 空间"
  },
  en: {
    modelGemini: "DeepSeek V3",
    modelKimi: "Kimi 2.6",
    newChat: "New Chat",
    userLabel: "User",
    agentLabel: "gsyen AI",
    inputPlaceholder: "Type anything here... (Shift + Enter for new line)",
    welcomeMessage: "Hello! I am your \"gsyen\" AI assistant. A clean, high-performance, eye-friendly chat interface fine-tuned for rapid technical assistance.\n\nSelect a preset software engineering project from the left sidebar to boost focus, or query me with custom requests below.",
    errorMessage: "An error occurred, please try again.",
    apiKeyWarning: "Notice: Please guarantee your GEMINI_API_KEY is configured inside Settings > Secrets for backend processing.",
    searchPlaceholder: "Search predefined projects...",
    projectsHeader: "gsyen Predefined Tasks",
    sidebarLogo: "gsyen AI",
    noProjectFound: "No matching project found",
    systemPromptHint: "Click to load project preset",
    workspaceHeader: "WORKSPACE CLUSTERS",
    navChat: "Intelligent Chat",
    navKanban: "Kanban Board",
    navCalendar: "Calendar Planner",
    navEmail: "Secured Emails",
    hsLinked: "Linked with HalfSphere",
    hsUnlinked: "Connect HalfSphere"
  }
};

// Time-based greeting
function getGreeting(lang: "zh" | "en"): string {
  const h = new Date().getHours();
  if (lang === "zh") {
    if (h >= 5 && h < 12) return "早上好";
    if (h >= 12 && h < 18) return "下午好";
    return "晚上好";
  }
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

// Quick-action chips shown in the empty state
const QUICK_CHIPS: Record<"zh" | "en", { label: string; prompt: string }[]> = {
  zh: [
    { label: "写作",   prompt: "帮我写：" },
    { label: "学习",   prompt: "帮我理解：" },
    { label: "写代码", prompt: "帮我写代码：" },
    { label: "翻译",   prompt: "帮我翻译：" },
    { label: "分析",   prompt: "帮我分析：" },
  ],
  en: [
    { label: "Write",     prompt: "Help me write: " },
    { label: "Learn",     prompt: "Help me learn about: " },
    { label: "Code",      prompt: "Write code for: " },
    { label: "Translate", prompt: "Translate this: " },
    { label: "Analyze",   prompt: "Analyze this for me: " },
  ],
};

// Lucide icons paired to each QUICK_CHIPS entry (same order)
const CHIP_ICONS: React.ElementType[] = [SquarePen, BookOpen, Code2, Globe, Search];

export default function App() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [isDark, setIsDark] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const [viewMode, setViewMode] = useState<"chat" | "kanban" | "calendar" | "email">("chat");
  const [selectedModel, setSelectedModel] = useState<"gemini" | "kimi">("kimi");
  const [isBound, setIsBound] = useState<boolean>(() => auth.isLoggedIn());
  const [boundEmail, setBoundEmail] = useState<string>(() => auth.getUser()?.email || "");
  const [isHalfsphereModalOpen, setIsHalfsphereModalOpen] = useState(false);
  const [showSyncIndicator, setShowSyncIndicator] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isWebSearch, setIsWebSearch] = useState(false);

  const handleCopy = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    });
  };

  const handleRetry = (msgId: string) => {
    const msgIdx = messages.findIndex(m => m.id === msgId);
    if (msgIdx < 1 || isStreaming) return;
    const userMsg = messages[msgIdx - 1];
    if (userMsg.role !== "user") return;
    // Remove last exchange and put user text back in the input
    setMessages(prev => prev.slice(0, msgIdx - 1));
    setInputValue(userMsg.content);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSyncNotify = () => {
    setShowSyncIndicator(true);
    setTimeout(() => {
      setShowSyncIndicator(false);
    }, 1800);
  };

  // auth.save/clear are called inside HalfsphereModal directly via auth.ts
  const handleBindChange = (boundState: boolean, emailStr: string) => {
    setIsBound(boundState);
    setBoundEmail(boundState ? emailStr : "");
    handleSyncNotify();
  };

  // On mount: verify the Supabase session is still valid. If not, clear stale cache.
  // NOTE: Only clear localStorage — never call signOut() here, that would trigger
  // another onAuthStateChange(session=null) and create an infinite loop.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && auth.isLoggedIn()) {
        localStorage.removeItem("hs_user");
        setIsBound(false);
        setBoundEmail("");
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && auth.isLoggedIn()) {
        localStorage.removeItem("hs_user");
        setIsBound(false);
        setBoundEmail("");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Focus the footer textarea when the first message is sent (textarea moves from center → footer)
  useEffect(() => {
    if (messages.length > 0 && !isStreaming) {
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Re-check login state when token expires (apiFetch dispatches this event on 401)
  useEffect(() => {
    const onExpired = () => {
      setIsBound(false);
      setBoundEmail("");
      setIsHalfsphereModalOpen(true);
    };
    window.addEventListener("hs:session-expired", onExpired);
    return () => window.removeEventListener("hs:session-expired", onExpired);
  }, []);

  const t = LOCALES[lang];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea: count newlines + fixed line-height (avoids scrollHeight font-metrics bug)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const LINE_H = 22.4;   // 1.6 * 14px
    const PAD_V  = 28;     // pt-5 (20px) + pb-2 (8px)
    const MAX_H  = 208;    // max-h-52
    const lines  = inputValue.split("\n").length;
    el.style.height = Math.min(lines * LINE_H + PAD_V, MAX_H) + "px";
  }, [inputValue]);
  const [clockStr, setClockStr] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(`UTC: ${now.toISOString().replace("T", " ").slice(0, 16)}Z`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  // Initialize app state
  useEffect(() => {
    localStorage.getItem("theme") === "dark" ? setIsDark(true) : setIsDark(false);
    const savedLang = localStorage.getItem("lang") as "zh" | "en";
    if (savedLang) setLang(savedLang);

    // Default to closed on mobile and open on desktop
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  // Update theme of element
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // Update localized state label dynamically on change
  const handleLangToggle = () => {
    const nextLang = lang === "zh" ? "en" : "zh";
    setLang(nextLang);
    localStorage.setItem("lang", nextLang);
  };

  // Scroll current view to bottom safely without causing parent window or iframe to jump
  useEffect(() => {
    const container = document.getElementById("messages-container");
    if (!container) return;

    // Check if user is near the bottom (tolerance of 150px) to prevent hijack when manual-scrolling up to read earlier responses
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 150;

    const lastMessage = messages[messages.length - 1];
    const isLastMessageUser = lastMessage && lastMessage.role === "user";

    if (isLastMessageUser) {
      // User sent a message: always scroll smoothly to establish the transition
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth"
      });
    } else if (isNearBottom) {
      // AI stream updates: scroll instantly with "auto" to prevent smooth animation frame congestion.
      // This is highly efficient and resolves stutter/lag completely ("德芙般丝滑").
      container.scrollTo({
        top: container.scrollHeight,
        behavior: isStreaming ? "auto" : "smooth"
      });
    }
  }, [messages, isStreaming]);

  // Handle send message logic
  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const userText = customText || inputValue;
    if (!userText.trim() || isStreaming) return;

    setInputValue("");
    setIsStreaming(true);

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toLocaleTimeString()
    };

    const assistantMsgId = `assistant_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString(),
      isStreaming: true
    };

    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, initialAssistantMsg]);

    try {
      const modelId = selectedModel === "kimi" ? "kimi-k2" : "deepseek-chat";
      const response = await apiFetch("/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          model: modelId,
          webSearch: isWebSearch
        })
      });

      if (!response.body) {
        throw new Error("No response streaming pipeline available.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let textChunkBuffer = "";
      let finished = false;
      let leftOverText = "";

      let lastUpdateTime = 0;
      let throttleTimeout: any = null;

      const updateUIState = (force = false) => {
        const now = Date.now();
        if (force || now - lastUpdateTime >= 8) {
          if (throttleTimeout) {
            clearTimeout(throttleTimeout);
            throttleTimeout = null;
          }
          lastUpdateTime = now;
          setMessages(prev => prev.map(m => {
            if (m.id === assistantMsgId) {
              return { ...m, content: textChunkBuffer };
            }
            return m;
          }));
        } else if (!throttleTimeout) {
          const delay = Math.max(0, 8 - (now - lastUpdateTime));
          throttleTimeout = setTimeout(() => {
            lastUpdateTime = Date.now();
            setMessages(prev => prev.map(m => {
              if (m.id === assistantMsgId) {
                return { ...m, content: textChunkBuffer };
              }
              return m;
            }));
            throttleTimeout = null;
          }, delay);
        }
      };

      try {
        while (!finished) {
          const { value, done } = await reader.read();
          if (done) {
            finished = true;
            // Stream ended — guarantee streaming flag is cleared even if "done" event was missed
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            ));
            setIsStreaming(false);
            break;
          }

          const decodedChunk = decoder.decode(value, { stream: true });
          const lines = (leftOverText + decodedChunk).split("\n\n");
          leftOverText = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const cleanJson = line.substring(6).trim();
                if (!cleanJson) continue;
                const payload = JSON.parse(cleanJson);

                if (payload.type === "text") {
                  textChunkBuffer += payload.text;
                  updateUIState(false);
                } else if (payload.type === "error") {
                  textChunkBuffer += `\n\n[Error]: ${payload.message}`;
                  updateUIState(true);
                  setMessages(prev => prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return { ...m, isStreaming: false };
                    }
                    return m;
                  }));
                } else if (payload.type === "done") {
                  updateUIState(true);
                  setMessages(prev => prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return { ...m, isStreaming: false };
                    }
                    return m;
                  }));
                  setIsStreaming(false);
                }
              } catch (jsError) {
                // Fragmentary lines skipped
              }
            }
          }
        }
        // Final flush just to be certain
        updateUIState(true);
      } finally {
        if (throttleTimeout) {
          clearTimeout(throttleTimeout);
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => {
        if (m.id === assistantMsgId) {
          return {
            ...m,
            content: `${t.errorMessage} (${err.message || "Unknown error"})`,
            isStreaming: false
          };
        }
        return m;
      }));
      setIsStreaming(false);
    }
  };

  // Trigger New Chat
  const handleNewChat = () => {
    if (isStreaming) return;
    setMessages([]);
    setInputValue("");
    if (textareaRef.current) textareaRef.current.focus();
  };

  // Markdown renderer for AI responses
  const AssistantMarkdown = ({ content }: { content: string }) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="gsyen-prose"
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const lang = match ? match[1] : "";
          const isBlock = className?.startsWith("language-") || String(children).includes("\n");
          if (isBlock) {
            return (
              <div className="my-4">
                {lang && (
                  <div className="bg-[var(--bg-code)] border-t border-r border-l border-[var(--border-code)] px-3 py-1 rounded-t text-[11px] font-semibold text-[var(--accent-color)] uppercase select-none">
                    {lang}
                  </div>
                )}
                <pre className={`p-4 bg-[var(--bg-code)] border border-[var(--border-code)] text-[var(--text-code)] overflow-x-auto text-[12.5px] leading-relaxed whitespace-pre font-mono shadow-sm ${lang ? "rounded-b-lg rounded-tr-lg" : "rounded-lg"}`}>
                  <code>{children}</code>
                </pre>
              </div>
            );
          }
          return <code className={className} {...props}>{children}</code>;
        },
        pre({ children }) {
          return <>{children}</>;
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  return (
    <div 
      className="h-screen max-h-screen flex transition-colors duration-150 w-full overflow-hidden font-sans text-sm bg-[var(--bg-main)] text-[var(--text-main)]"
      style={{ fontSize: "14.5px", lineHeight: "1.75" }}
      id="root-container"
    >
      {/* 1. LEFT SIDEBAR (Dynamic themes matching day/night mode) */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 bg-[var(--bg-sidebar)] text-[var(--text-sidebar)] flex flex-col transition-all duration-300 ease-in-out border-r border-[var(--border-sidebar)] flex-shrink-0 ${
          sidebarOpen
            ? "w-[260px] pt-0 px-4.5 pb-4.5 translate-x-0 opacity-100"
            : "-translate-x-full md:translate-x-0 w-0 p-0 border-r-0 overflow-hidden opacity-0 pointer-events-none"
        } md:relative`}
        id="sidebar-panel"
      >
        {/* Sidebar Header with Serif Chinese + Elegant Display English Logo */}
        <div className="h-10 flex items-center justify-between mb-3 flex-shrink-0" id="sidebar-header">
          <div 
            className={`relative flex items-center gap-2.5 select-none py-1.5 px-3 rounded-xl border overflow-hidden transition-all duration-150 ${
              isDark 
                ? "bg-gradient-to-r from-[#251206] to-[#170B03] border-[#FF5500]/30 shadow-none" 
                : "bg-white border-[#FF5500]/15 shadow-[0_2px_8px_rgba(255,85,0,0.04)]"
            }`} 
            id="sidebar-logo-container"
          >
            {/* Ambient translucent blur background for glow depth */}
            <div className="absolute -left-2 -top-6 w-16 h-16 rounded-full bg-[#FF7300]/15 blur-xl pointer-events-none" />
            <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-[#FFE100]/10 blur-xl pointer-events-none" />
            
            <div className="relative flex items-baseline gap-2">
              <span className="font-sans font-extrabold text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#FF8800] via-[#FF5500] to-[#FF2200] drop-shadow-[0_2px_8px_rgba(255,90,0,0.24)]">
                疆域
              </span>
              <span className={`font-display font-semibold text-[10px] tracking-[0.25em] uppercase opacity-95 ${
                isDark ? "text-[#FFF3E0]" : "text-[#D84400]"
              }`}>
                gsyen
              </span>
            </div>
          </div>
          {/* Sidebar toggle — lives here when sidebar is open, nudged toward the dividing line */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="pl-1.5 pr-0 py-1.5 rounded-lg text-[var(--text-sidebar-muted)] hover:text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)] cursor-pointer transition-all duration-150 flex-shrink-0"
            title="Close sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal Navigation Row — flat, no container box, all icons visually level */}
        <div className="flex items-center mb-3" id="workspace-icons-nav">
          <button
            onClick={() => {
              setViewMode("chat");
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={`flex-1 flex justify-center items-center py-2.5 rounded-lg transition-all duration-150 cursor-pointer ${
              viewMode === "chat"
                ? "text-[var(--text-main)]"
                : "text-[var(--text-sidebar-muted)] hover:text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)]"
            }`}
            title={t.navChat}
            id="nav-chat-tab-icon"
          >
            <MessageSquare className="w-4.5 h-4.5" strokeWidth={viewMode === "chat" ? 2.6 : 2.2} />
          </button>

          <button
            onClick={() => {
              setViewMode("kanban");
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={`flex-1 flex justify-center items-center py-2.5 rounded-lg transition-all duration-150 cursor-pointer ${
              viewMode === "kanban"
                ? "text-[var(--text-main)]"
                : "text-[var(--text-sidebar-muted)] hover:text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)]"
            }`}
            title={t.navKanban}
            id="nav-kanban-tab-icon"
          >
            <TrelloBoard className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={() => {
              setViewMode("calendar");
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={`flex-1 flex justify-center items-center py-2.5 rounded-lg transition-all duration-150 cursor-pointer ${
              viewMode === "calendar"
                ? "text-[var(--text-main)]"
                : "text-[var(--text-sidebar-muted)] hover:text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)]"
            }`}
            title={t.navCalendar}
            id="nav-calendar-tab-icon"
          >
            <CalendarRange className="w-4.5 h-4.5" strokeWidth={viewMode === "calendar" ? 2.6 : 2.2} />
          </button>

          <button
            onClick={() => {
              setViewMode("email");
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={`flex-1 flex justify-center items-center py-2.5 rounded-lg transition-all duration-150 cursor-pointer ${
              viewMode === "email"
                ? "text-[var(--text-main)]"
                : "text-[var(--text-sidebar-muted)] hover:text-[var(--text-sidebar)] hover:bg-[var(--bg-sidebar-hover)]"
            }`}
            title={t.navEmail}
            id="nav-email-tab-icon"
          >
            <Mail className="w-4.5 h-4.5" strokeWidth={viewMode === "email" ? 2.6 : 2.2} />
          </button>
        </div>

        {/* Big New Chat Button (Claude terracotta style) */}
        <button
          onClick={() => {
            setViewMode("chat");
            handleNewChat();
            if (window.innerWidth < 768) {
              setSidebarOpen(false);
            }
          }}
          className="flex items-center gap-3 w-full border border-[var(--border-sidebar)]/60 hover:border-[var(--border-sidebar)] bg-[var(--bg-sidebar-hover)] hover:bg-[var(--bg-sidebar-active)] rounded-lg py-2.5 px-3 transition text-xs text-[var(--text-sidebar)] font-medium cursor-pointer mb-3 select-none"
          id="sidebar-new-chat-btn"
        >
          <SquarePen className="w-4 h-4 text-[var(--text-sidebar-muted)] flex-shrink-0" />
          <span>{t.newChat}</span>
        </button>

        {/* Search Bar matching the Search Chats concept */}
        <div className="relative mb-4.5" id="sidebar-search-container">
          <Search className="w-3.5 h-3.5 text-[var(--text-sidebar-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full bg-[var(--bg-sidebar-search)] border border-[var(--border-sidebar)] focus:border-neutral-300/60 dark:focus:border-neutral-600/60 focus:bg-[var(--bg-sidebar-search-focus)] rounded-lg py-2 pl-9 pr-3 text-xs text-[var(--text-sidebar)] placeholder-[var(--text-sidebar-muted)]/50 outline-none transition"
            id="sidebar-search-input"
          />
        </div>

        {/* Projects list */}
        <div className="flex-1 flex flex-col overflow-y-auto" id="projects-scroller">
          <div className="flex items-center gap-2 text-[var(--text-sidebar-muted)] mb-3 px-1 select-none">
            <Folder className="w-3.5 h-3.5 text-[var(--text-sidebar-muted)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">{t.projectsHeader}</span>
          </div>

          <div className="flex flex-col gap-1.5" id="projects-list-items">
            {(() => {
              const q = searchQuery.toLowerCase();
              const filtered = SIDEBAR_PROJECTS.filter(p => {
                const name = (lang === "zh" ? p.name.zh : p.name.en).toLowerCase();
                const cat = (lang === "zh" ? p.category.zh : p.category.en).toLowerCase();
                return name.includes(q) || cat.includes(q);
              });
              if (filtered.length === 0) {
                return (
                  <div className="text-[var(--text-sidebar-muted)] text-xs px-2 py-4 italic text-center select-none font-sans" id="no-projects-msg">
                    {t.noProjectFound}
                  </div>
                );
              }
              return filtered.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => {
                    handleNewChat();
                    handleSend(undefined, lang === "zh" ? proj.prompt.zh : proj.prompt.en);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-[var(--bg-sidebar-hover)] transition flex items-start gap-2.5 group cursor-pointer border border-transparent hover:border-[var(--border-sidebar)]"
                  title={t.systemPromptHint}
                  id={`sidebar-project-item-${proj.id}`}
                >
                  <Terminal className="w-3.5 h-3.5 mt-0.5 text-[var(--text-muted)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--text-sidebar)] text-[12px] font-medium truncate group-hover:text-[var(--text-main)] font-sans">
                      {lang === "zh" ? proj.name.zh : proj.name.en}
                    </div>
                    <div className="text-[10px] text-[var(--text-sidebar-muted)] font-mono tracking-wider">
                      {lang === "zh" ? proj.category.zh : proj.category.en}
                    </div>
                  </div>
                </button>
              ));
            })()}
          </div>
        </div>

        {/* HalfSphere Sync Card on Sidebar Bottom */}
        <div className="mb-3.5 mt-4" id="halfsphere-connector-card">
          <button
            onClick={() => setIsHalfsphereModalOpen(true)}
            className={`w-full text-left p-2.5 rounded-xl border select-none transition-all duration-150 cursor-pointer ${
              isBound 
                ? "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20 text-[var(--text-sidebar)] hover:border-emerald-500/35" 
                : "bg-[var(--bg-sidebar-hover)] hover:bg-[var(--bg-sidebar-active)] border-[var(--border-sidebar)] text-[var(--text-sidebar)] hover:border-[var(--border-sidebar)]"
            }`}
            title={isBound ? t.hsLinked : t.hsUnlinked}
          >
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isBound ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"}`} />
              <span className="text-[11px] font-bold font-sans">
                {isBound ? t.hsLinked : t.hsUnlinked}
              </span>
            </div>
            <div className="text-[9.5px] text-[var(--text-sidebar-muted)] font-mono mt-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {isBound ? boundEmail : "Offline mode / 点击绑定"}
            </div>
          </button>
        </div>

        {/* Sidebar Footer Indicator with custom status */}
        <div className="border-t border-[var(--border-sidebar)] pt-3.5 mt-auto flex flex-col gap-1 select-none" id="sidebar-footer">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-sidebar-muted)] font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse pulsing-dot"></span>
            <span>Gemini Sandbox</span>
          </div>
          <span className="text-[9px] text-[var(--text-sidebar-muted)]/80 font-mono" id="current-timestamp-stamp">
            {clockStr}
          </span>
        </div>
      </aside>

      {/* Backdrop for mobile sidebar when active */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity"
          id="mobile-backdrop"
        />
      )}

      {/* 2. MAIN CONVERSATION & INPUT AREA (Elegant Claude Paper Aesthetics) */}
      <div 
        className="flex-1 flex flex-col justify-between overflow-hidden relative bg-[var(--bg-main)]"
        id="main-viewport"
      >
        {/* 1. TOP BAR */}
        <header
          className="h-10 px-4 flex items-center justify-between sticky top-0 z-40 select-none bg-transparent"
          id="top-bar"
        >
          {/* Sidebar open trigger — only shown when sidebar is collapsed */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] cursor-pointer transition-all duration-150 flex items-center justify-center select-none"
              title="Open sidebar"
              id="sidebar-toggle-btn"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          {/* Right Action buttons — always flush right */}
          <div className="flex items-center gap-1 ml-auto" id="header-actions">
            {/* Language Toggle */}
            <button
              type="button"
              onClick={handleLangToggle}
              className="cursor-pointer p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all duration-150 flex items-center justify-center select-none active:scale-95"
              title="Toggle Language / 中英切换"
              id="lang-toggle-btn"
            >
              <Globe className="w-4 h-4" />
            </button>

            {/* Theme switcher toggle */}
            <button
              type="button"
              onClick={() => setIsDark(!isDark)}
              className="cursor-pointer p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all duration-150 flex items-center justify-center select-none active:scale-95"
              title="Toggle Dark Mode"
              id="darkmode-toggle-btn"
            >
              {isDark ? (
                <Moon className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        {/* Render views conditionally based on the active selection */}
        {viewMode === "chat" && (
          <>
            {/* 2. CHAT CONVERSATION AREA */}
            <main className="flex-1 overflow-y-auto" id="messages-container">
              {messages.length === 0 ? (
                /* Empty state — pixel-matching Claude's centered layout */
                <div className="h-full flex flex-col items-center justify-center px-4 select-none" style={{ paddingBottom: "4vh" }}>

                  {/* ✳ asterisk + greeting on the same line */}
                  <div className="flex items-center gap-4 mb-7">
                    <span
                      className="text-[var(--accent-color)] flex-shrink-0"
                      style={{ fontSize: "2.6rem", lineHeight: 1 }}
                    >
                      ✳
                    </span>
                    <h1
                      className="text-[30px] md:text-[38px] text-[var(--text-main)] tracking-tight leading-none"
                      style={{ fontFamily: "var(--font-serif-zh)", fontWeight: 450 }}
                    >
                      {getGreeting(lang)}{isBound && auth.getUser()?.name ? `，${auth.getUser()!.name}` : ""}
                    </h1>
                  </div>

                  {/* Input box — centered in the page, same look as the footer version */}
                  <div className="w-full max-w-2xl mb-5">
                    <ChatInput
                      textareaRef={textareaRef}
                      inputValue={inputValue}
                      setInputValue={setInputValue}
                      isStreaming={isStreaming}
                      isWebSearch={isWebSearch}
                      onToggleWebSearch={() => setIsWebSearch(v => !v)}
                      selectedModel={selectedModel}
                      onToggleModel={() => setSelectedModel(prev => prev === "gemini" ? "kimi" : "gemini")}
                      onSubmit={handleSend}
                      lang={lang}
                      t={t}
                    />
                  </div>

                  {/* Quick chips — single horizontal pill row below the input */}
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    {QUICK_CHIPS[lang].map((chip, i) => {
                      const Icon = CHIP_ICONS[i];
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            setInputValue(chip.prompt);
                            setTimeout(() => textareaRef.current?.focus(), 10);
                          }}
                          className="flex items-center gap-2 px-3.5 py-[4px] rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-input)] hover:border-[var(--border-color)] hover:text-[var(--text-main)] text-[var(--text-muted)] transition-all cursor-pointer text-[13px] font-medium leading-none"
                        >
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{chip.label}</span>
                        </button>
                      );
                    })}
                  </div>

                </div>
              ) : (
                <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 pb-32 md:pt-12 md:pb-40 flex flex-col gap-8" id="messages-scroller-inner">
                  {messages.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                      <div
                        key={msg.id}
                        className={`w-full flex ${isUser ? "justify-end" : "justify-start"}`}
                        id={`message-row-${msg.id}`}
                      >
                        {isUser ? (
                          <div
                            className="max-w-[85%] px-5 py-3.5 rounded-[18px] rounded-tr-[4px] shadow-sm bg-[var(--bg-user-bubble)] text-[var(--text-main)] transition-all"
                            id={`content-body-${msg.id}`}
                          >
                            <div className="whitespace-pre-wrap font-sans font-medium tracking-wide text-[14.5px] leading-relaxed">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-full text-left break-words text-[var(--text-main)] transition-all group"
                            id={`content-body-${msg.id}`}
                          >
                            <AssistantMarkdown content={msg.content} />

                            {/* Spinning ✳ asterisk while waiting for the first token */}
                            {msg.isStreaming && !msg.content && (
                              <div className="flex items-center mt-2 pl-0.5" id="pulse-loader">
                                <span
                                  className="text-[var(--accent-color)] asterisk-spin"
                                  style={{ fontSize: "1.3rem", lineHeight: 1 }}
                                >
                                  ✳
                                </span>
                              </div>
                            )}

                            {/* Action row — fades in on hover below each completed AI message */}
                            {!msg.isStreaming && msg.content && (
                              <div className="flex items-center gap-0.5 mt-2 -ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(msg.content, msg.id)}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all"
                                  title={lang === "zh" ? "复制" : "Copy"}
                                >
                                  {copiedMsgId === msg.id
                                    ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    : <Copy className="w-3.5 h-3.5" />
                                  }
                                </button>
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all"
                                  title={lang === "zh" ? "有帮助" : "Good response"}
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all"
                                  title={lang === "zh" ? "没帮助" : "Bad response"}
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRetry(msg.id)}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all"
                                  title={lang === "zh" ? "重新生成" : "Retry"}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </main>
    
            {/* 3. CONVERSATION INPUT FOOTER — only visible once a conversation has started */}
            {messages.length > 0 && (
            <footer
              className="absolute bottom-0 left-0 right-0 pt-2 pb-3 bg-transparent border-t-0 pointer-events-none z-30"
              id="footer-input-bar"
            >
              <div className="max-w-3xl mx-auto px-4 md:px-6 relative pointer-events-auto">
                <ChatInput
                  textareaRef={textareaRef}
                  inputValue={inputValue}
                  setInputValue={setInputValue}
                  isStreaming={isStreaming}
                  isWebSearch={isWebSearch}
                  onToggleWebSearch={() => setIsWebSearch(v => !v)}
                  selectedModel={selectedModel}
                  onToggleModel={() => setSelectedModel(prev => prev === "gemini" ? "kimi" : "gemini")}
                  onSubmit={handleSend}
                  lang={lang}
                  t={t}
                  shadowStyle="shadow-[0_4px_18px_rgba(0,0,0,0.06)]"
                />
    
                {/* Prompt micro security warning underneath the keyboard wrap */}
                <p className="text-[11px] text-center text-[var(--text-muted)] mt-1.5 transition select-none hover:text-[var(--accent-color)]">
                  {t.apiKeyWarning}
                </p>
              </div>
            </footer>
            )}
          </>
        )}

        {viewMode === "kanban" && (
          <KanbanView
            isDark={isDark}
            lang={lang}
            isBound={isBound}
            onSyncNotify={handleSyncNotify}
          />
        )}

        {viewMode === "calendar" && (
          <CalendarView
            isDark={isDark}
            lang={lang}
            isBound={isBound}
            onSyncNotify={handleSyncNotify}
          />
        )}

        {viewMode === "email" && (
          <EmailView
            isDark={isDark}
            lang={lang}
            isBound={isBound}
            onSyncNotify={handleSyncNotify}
          />
        )}
      </div>

      {/* Halfsphere account connector modal overlay */}
      <HalfsphereModal
        isOpen={isHalfsphereModalOpen}
        onClose={() => setIsHalfsphereModalOpen(false)}
        lang={lang}
        isBound={isBound}
        onBindChange={handleBindChange}
      />

      {/* Real-time floating upload/sync indicator toast */}
      {showSyncIndicator && (
        <div className="fixed top-14 right-5 bg-emerald-600 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg border border-emerald-400/25 flex items-center gap-2 z-50 select-none animate-bounce" id="global-sync-toast">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          <span>{lang === "zh" ? "已备份同步至 HalfSphere 生态" : "Successfully synced with HalfSphere!"}</span>
        </div>
      )}
    </div>
  );
}
