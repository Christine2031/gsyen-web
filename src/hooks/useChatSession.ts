import { useState, useEffect, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { ChatMessage, StoredSession } from '../types/chat';
import { chatSessionStore } from '../stores/chatSessionStore';
import { ModelId } from '../config/models';

interface UseChatSessionReturn {
  messages: ChatMessage[];
  sessions: StoredSession[];
  currentSessionId: string | null;
  currentTeamId: string | null;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  saveChat: (msgs: ChatMessage[], model: ModelId) => void;
  loadSession: (session: StoredSession) => void;
  deleteSession: (id: string) => void;
  newChat: (model: ModelId) => void;
  openTeamSession: (teamId: string) => void;
}

export function useChatSession(lang: 'zh' | 'en'): UseChatSessionReturn {
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  const sessionIdRef  = useRef<string | null>(null);
  const teamIdRef     = useRef<string | null>(null);

  useEffect(() => {
    const allSessions = chatSessionStore.loadAll();
    setSessions(allSessions);
    const saved = chatSessionStore.loadCurrentChat();
    if (saved.length > 0) {
      setMessagesState(saved);
      // 优先用持久化的 session ID 直接恢复，不依赖消息匹配
      const savedId = localStorage.getItem('gsyen_current_session_id');
      const match = savedId
        ? allSessions.find(s => s.id === savedId)
        : allSessions.find(s => {
            const lastUserMsg = [...saved].reverse().find(m => m.role === 'user');
            return lastUserMsg && s.messages.some(m => m.id === lastUserMsg.id);
          });
      if (match) {
        sessionIdRef.current = match.id;
        teamIdRef.current    = match.teamId ?? null;
        setCurrentSessionId(match.id);
        setCurrentTeamId(match.teamId ?? null);
      }
    } else {
      setMessagesState([defaultGreeting(lang)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    const handler = () => setSessions(chatSessionStore.loadAll());
    window.addEventListener('chat-sessions-updated', handler);
    return () => window.removeEventListener('chat-sessions-updated', handler);
  }, []);

  const setMessages: Dispatch<SetStateAction<ChatMessage[]>> = useCallback(
    (msgs) => setMessagesState(msgs), []
  );

  const saveChat = useCallback((msgs: ChatMessage[], model: ModelId) => {
    setMessagesState(msgs);
    chatSessionStore.saveCurrentChat(msgs);
    if (msgs.some(m => m.role === 'user')) {
      if (!sessionIdRef.current) {
        sessionIdRef.current = crypto.randomUUID();
        setCurrentSessionId(sessionIdRef.current);
      }
      localStorage.setItem('gsyen_current_session_id', sessionIdRef.current);
      const updated = chatSessionStore.upsert(
        sessionIdRef.current, msgs, model, teamIdRef.current ?? undefined
      );
      setSessions(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSession = useCallback((session: StoredSession) => {
    sessionIdRef.current = session.id;
    teamIdRef.current    = session.teamId ?? null;
    setCurrentSessionId(session.id);
    setCurrentTeamId(session.teamId ?? null);
    setMessagesState(session.messages);
    chatSessionStore.saveCurrentChat(session.messages);
    localStorage.setItem('gsyen_current_session_id', session.id);
  }, []);

  const deleteSession = useCallback((id: string) => {
    const updated = chatSessionStore.delete(id);
    setSessions(updated);
    if (sessionIdRef.current === id) {
      sessionIdRef.current = null;
      teamIdRef.current    = null;
      setCurrentSessionId(null);
      setCurrentTeamId(null);
      setMessagesState([defaultGreeting(lang)]);
      chatSessionStore.clearCurrentChat();
      localStorage.removeItem('gsyen_current_session_id');
    }
  }, [lang]);

  const newChat = useCallback((model: ModelId) => {
    const id = crypto.randomUUID();
    sessionIdRef.current = id;
    teamIdRef.current    = null;
    setCurrentSessionId(id);
    setCurrentTeamId(null);
    setMessagesState([]);
    chatSessionStore.clearCurrentChat();
    localStorage.setItem('gsyen_current_session_id', id);
    const updated = chatSessionStore.upsert(id, [], model);
    setSessions(updated);
  }, []);

  const openTeamSession = useCallback((teamId: string) => {
    const existing = chatSessionStore.findTeamSession(teamId);
    if (existing) {
      sessionIdRef.current = existing.id;
      teamIdRef.current    = teamId;
      setCurrentSessionId(existing.id);
      setCurrentTeamId(teamId);
      const msgs = existing.messages.length > 0 ? existing.messages : [defaultGreeting(lang)];
      setMessagesState(msgs);
      chatSessionStore.saveCurrentChat(msgs);
    } else {
      // New team session — id assigned on first message
      sessionIdRef.current = null;
      teamIdRef.current    = teamId;
      setCurrentSessionId(null);
      setCurrentTeamId(teamId);
      setMessagesState([defaultGreeting(lang)]);
      chatSessionStore.clearCurrentChat();
    }
  }, [lang]);

  return {
    messages, sessions, currentSessionId, currentTeamId,
    setMessages, saveChat, loadSession, deleteSession, newChat, openTeamSession,
  };
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
