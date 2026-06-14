import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, StoredSession } from '../types/chat';
import { chatSessionStore } from '../stores/chatSessionStore';
import { ModelId } from '../config/models';

interface UseChatSessionReturn {
  messages: ChatMessage[];
  sessions: StoredSession[];
  currentSessionId: string | null;
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  saveChat: (msgs: ChatMessage[], model: ModelId) => void;
  loadSession: (session: StoredSession) => void;
  deleteSession: (id: string) => void;
  newChat: () => void;
}

export function useChatSession(lang: 'zh' | 'en'): UseChatSessionReturn {
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Ref keeps the session ID readable synchronously inside async callbacks,
  // avoiding stale closure bugs during streaming (onToken fires hundreds of times).
  const sessionIdRef = useRef<string | null>(null);

  // Boot: load persisted chat + session list
  useEffect(() => {
    setSessions(chatSessionStore.loadAll());
    const saved = chatSessionStore.loadCurrentChat();
    if (saved.length > 0) {
      setMessagesState(saved);
    } else {
      setMessagesState([defaultGreeting(lang)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Realtime cross-device sync: another device wrote → store dispatches event → re-load sessions
  useEffect(() => {
    const handler = () => setSessions(chatSessionStore.loadAll());
    window.addEventListener('chat-sessions-updated', handler);
    return () => window.removeEventListener('chat-sessions-updated', handler);
  }, []);

  const setMessages = useCallback((msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState(msgs);
  }, []);

  const saveChat = useCallback((msgs: ChatMessage[], model: ModelId) => {
    setMessagesState(msgs);
    chatSessionStore.saveCurrentChat(msgs);
    if (msgs.some(m => m.role === 'user')) {
      // Use ref for synchronous read — state would be stale inside async loops
      if (!sessionIdRef.current) {
        sessionIdRef.current = `session-${Date.now()}`;
        setCurrentSessionId(sessionIdRef.current);
      }
      const updated = chatSessionStore.upsert(sessionIdRef.current, msgs, model);
      setSessions(updated);
    }
  // Empty deps intentional: all reads go through ref or stable store
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSession = useCallback((session: StoredSession) => {
    sessionIdRef.current = session.id;
    setCurrentSessionId(session.id);
    setMessagesState(session.messages);
    chatSessionStore.saveCurrentChat(session.messages);
  }, []);

  const deleteSession = useCallback((id: string) => {
    const updated = chatSessionStore.delete(id);
    setSessions(updated);
    if (sessionIdRef.current === id) {
      sessionIdRef.current = null;
      setCurrentSessionId(null);
      setMessagesState([defaultGreeting(lang)]);
      chatSessionStore.clearCurrentChat();
    }
  }, [lang]);

  const newChat = useCallback(() => {
    sessionIdRef.current = null;
    setCurrentSessionId(null);
    setMessagesState([]);
    chatSessionStore.clearCurrentChat();
  }, []);

  return { messages, sessions, currentSessionId, setMessages, saveChat, loadSession, deleteSession, newChat };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function defaultGreeting(lang: 'zh' | 'en'): ChatMessage {
  return {
    id: `greet-${Date.now()}`,
    role: 'model',
    content: lang === 'zh'
      ? '欢迎来到 **疆域灵阁 (GSYEN Muse)**。\n\n我是您的智能美学设计与品牌策略助手。在这里，您可以向我咨询品牌艺术命名、高级视觉符号创意、排版色彩推荐及业务流程规划。请在下方输入您的畅想，或选择侧边栏的灵感命题开始：'
      : 'Welcome to the **GSYEN Muse Atelier Workspace**.\n\nI am your digital brand curator and creative consultant. Begin by typing an inquiry or selecting one of our curated prompts below:',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}
