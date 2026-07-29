import { useState, useEffect, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { ChatDocumentSource, ChatMessage, StoredSession } from '../types/chat';
import { chatSessionStore } from '../stores/chatSessionStore';
import { chatDocumentStore } from '../stores/chatDocumentStore';
import { ModelId } from '../config/models';

interface UseChatSessionReturn {
  messages: ChatMessage[];
  sessions: StoredSession[];
  currentSessionId: string | null;
  currentTeamId: string | null;
  sourceDocuments: ChatDocumentSource[];
  removeSourceDocument: (id: string) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  saveChat: (msgs: ChatMessage[], model: ModelId, newDocuments?: ChatDocumentSource[]) => void;
  loadSession: (session: StoredSession) => void;
  deleteSession: (id: string) => void;
  newChat: (model: ModelId) => string;
  openTeamSession: (teamId: string) => void;
}

export function useChatSession(lang: 'zh' | 'en'): UseChatSessionReturn {
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [sourceDocuments, setSourceDocuments] = useState<ChatDocumentSource[]>([]);

  const sessionIdRef  = useRef<string | null>(null);
  const teamIdRef     = useRef<string | null>(null);
  const sourceDocumentsRef = useRef<ChatDocumentSource[]>([]);

  useEffect(() => {
    const allSessions = chatSessionStore.loadAll();
    setSessions(allSessions);
    const saved = chatSessionStore.loadCurrentChat();
    const hasRealSavedChat = saved.length > 0 && !isLegacyGreetingOnly(saved);

    if (hasRealSavedChat) {
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
        const documents = chatDocumentStore.load(match.id);
        sourceDocumentsRef.current = documents;
        setSourceDocuments(documents);
      }
    } else {
      setMessagesState([]);
      chatSessionStore.clearCurrentChat();
      sourceDocumentsRef.current = [];
      setSourceDocuments([]);
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

  const saveChat = useCallback((msgs: ChatMessage[], model: ModelId, newDocuments: ChatDocumentSource[] = []) => {
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
      if (newDocuments.length) {
        const nextDocuments = mergeDocuments(sourceDocumentsRef.current, newDocuments);
        sourceDocumentsRef.current = nextDocuments;
        setSourceDocuments(nextDocuments);
        chatDocumentStore.save(sessionIdRef.current, nextDocuments);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSession = useCallback((session: StoredSession) => {
    sessionIdRef.current = session.id;
    teamIdRef.current    = session.teamId ?? null;
    setCurrentSessionId(session.id);
    setCurrentTeamId(session.teamId ?? null);
    const documents = chatDocumentStore.load(session.id);
    sourceDocumentsRef.current = documents;
    setSourceDocuments(documents);
    setMessagesState(isLegacyGreetingOnly(session.messages) ? [] : session.messages);
    chatSessionStore.saveCurrentChat(isLegacyGreetingOnly(session.messages) ? [] : session.messages);
    localStorage.setItem('gsyen_current_session_id', session.id);
  }, []);

  const deleteSession = useCallback((id: string) => {
    const updated = chatSessionStore.delete(id);
    chatDocumentStore.remove(id);
    setSessions(updated);
    if (sessionIdRef.current === id) {
      sessionIdRef.current = null;
      teamIdRef.current    = null;
      setCurrentSessionId(null);
      setCurrentTeamId(null);
      sourceDocumentsRef.current = [];
      setSourceDocuments([]);
      setMessagesState([]);
      chatSessionStore.clearCurrentChat();
      localStorage.removeItem('gsyen_current_session_id');
    }
  }, []);

  const newChat = useCallback((model: ModelId) => {
    const id = crypto.randomUUID();
    sessionIdRef.current = id;
    teamIdRef.current    = null;
    setCurrentSessionId(id);
    setCurrentTeamId(null);
    sourceDocumentsRef.current = [];
    setSourceDocuments([]);
    setMessagesState([]);
    chatSessionStore.clearCurrentChat();
    localStorage.setItem('gsyen_current_session_id', id);
    const updated = chatSessionStore.upsert(id, [], model);
    setSessions(updated);
    return id;
  }, []);

  const removeSourceDocument = useCallback((id: string) => {
    const nextDocuments = sourceDocumentsRef.current.filter(source => source.id !== id);
    sourceDocumentsRef.current = nextDocuments;
    setSourceDocuments(nextDocuments);
    if (!sessionIdRef.current) return;
    if (nextDocuments.length) chatDocumentStore.save(sessionIdRef.current, nextDocuments);
    else chatDocumentStore.remove(sessionIdRef.current);
  }, []);

  const openTeamSession = useCallback((teamId: string) => {
    const existing = chatSessionStore.findTeamSession(teamId);
    if (existing) {
      sessionIdRef.current = existing.id;
      teamIdRef.current    = teamId;
      setCurrentSessionId(existing.id);
      setCurrentTeamId(teamId);
      const documents = chatDocumentStore.load(existing.id);
      sourceDocumentsRef.current = documents;
      setSourceDocuments(documents);
      const msgs = isLegacyGreetingOnly(existing.messages) ? [] : existing.messages;
      setMessagesState(msgs);
      chatSessionStore.saveCurrentChat(msgs);
    } else {
      sessionIdRef.current = null;
      teamIdRef.current    = teamId;
      setCurrentSessionId(null);
      setCurrentTeamId(teamId);
      sourceDocumentsRef.current = [];
      setSourceDocuments([]);
      setMessagesState([]);
      chatSessionStore.clearCurrentChat();
    }
  }, []);

  return {
    messages, sessions, currentSessionId, currentTeamId, sourceDocuments, removeSourceDocument,
    setMessages, saveChat, loadSession, deleteSession, newChat, openTeamSession,
  };
}

function mergeDocuments(current: ChatDocumentSource[], incoming: ChatDocumentSource[]): ChatDocumentSource[] {
  const byId = new Map(current.map(source => [source.id, source]));
  incoming.forEach(source => byId.set(source.id, source));
  return [...byId.values()].slice(-4);
}

function isLegacyGreetingOnly(messages: ChatMessage[]): boolean {
  return messages.length === 1
    && messages[0].role === 'model'
    && (messages[0].id.startsWith('greet-') || messages[0].content.includes('欢迎来到 **疆域灵阁'));
}
