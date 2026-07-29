/**
 * useChatOrchestrator — 发送编排：runPrompt、忙碌判定、排队消费。
 * 从 ChatModule.tsx 拆出（单文件 ≤ 300 行铁律）；逻辑原样保留。
 */
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, ActionCard, ChatAttachment, ChatDocumentSource } from '../types/chat';
import { documentAttachmentMeta } from '../utils/chatDocuments';
import { ModelId } from '../config/models';
import { useChatStream } from './useChatStream';
import { useChatPromptQueue } from './useChatPromptQueue';
import { settleInterruptedAssistant } from './chatStreamingState';

interface OrchestratorOpts {
  lang: 'zh' | 'en';
  selectedModel: ModelId;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  saveChat: (msgs: ChatMessage[], model: ModelId, newDocuments?: ChatDocumentSource[]) => void;
  currentTeamId: string | null;
  sourceDocuments: ChatDocumentSource[];
  showToast: (msg: string) => void;
}

export function useChatOrchestrator({
  lang, selectedModel, messages, setMessages, saveChat, currentTeamId, sourceDocuments, showToast,
}: OrchestratorOpts) {
  const [inputVal, setInputVal] = useState('');
  const { isLoading, send, cancel } = useChatStream();
  const { queuedPrompts, queuedRef, enqueuePrompt, takeNextPrompt, clearQueue } = useChatPromptQueue();

  const pendingCard = useRef<ActionCard | null>(null);
  const isBusyRef = useRef(false);
  const queueRunningRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const hasStreamingAssistant = messages.some(msg => msg.role === 'model' && msg.streaming);
  const isBusy = isLoading || hasStreamingAssistant;

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isBusyRef.current = isBusy; }, [isBusy]);

  const runPrompt = useCallback(async ({ text, attachments = [], timestamp }: { text: string; attachments?: Array<ChatAttachment | ChatDocumentSource>; timestamp?: string }) => {
    if (!text.trim() && attachments.length === 0) return;
    isBusyRef.current = true;
    let activeAssistantId: string | null = null;

    try {
      const newDocuments = attachments.filter((attachment): attachment is ChatDocumentSource =>
        attachment.type === 'document' && 'chunks' in attachment
      );
      const displayAttachments: ChatAttachment[] = attachments.map(attachment =>
        attachment.type === 'document' && 'chunks' in attachment ? documentAttachmentMeta(attachment) : attachment
      );
      const documents = mergeDocumentSources(sourceDocuments, newDocuments);
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: timestamp ?? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachments: displayAttachments,
      };
      const liveMessages = messagesRef.current;
      const history = [...liveMessages, userMsg];

      saveChat(history, selectedModel, newDocuments);
      setInputVal('');

      if (currentTeamId && !/^@缈缈|^@miaomiao/i.test(text.trimStart())) return;

      const aiId = `ai-${Date.now()}`;
      activeAssistantId = aiId;
      const aiTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages([...history, { id: aiId, role: 'model', content: '', timestamp: aiTime, streaming: true }]);

      await send({
        text,
        attachments: displayAttachments,
        documents,
        model: selectedModel,
        history: liveMessages,
        lang,
        onToken: (partial) => {
          setMessages([...history, {
            id: aiId, role: 'model', content: partial, timestamp: aiTime,
            card: pendingCard.current ?? undefined, streaming: true,
          }]);
        },
        onActionCard: (card) => {
          pendingCard.current = card;
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, card } : m));
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
            query: '📅 已查询今日日程',
          };
          const en: Record<string, string> = {
            create: `✅ Event created: ${title}`,
            update: `✏️ Event updated: ${title}`,
            delete: `🗑️ Event deleted: ${title}`,
            query: "📅 Today's schedule retrieved",
          };
          showToast(lang === 'zh' ? (zh[action] ?? `✅ ${title}`) : (en[action] ?? `✅ ${title}`));
        },
      });
    } finally {
      if (activeAssistantId) {
        setMessages(current => settleInterruptedAssistant(current, activeAssistantId));
      }
      isBusyRef.current = false;
    }
  }, [selectedModel, lang, saveChat, setMessages, send, currentTeamId, sourceDocuments, showToast]);

  const handleSend = useCallback(async (text: string, attachments: Array<ChatAttachment | ChatDocumentSource> = []) => {
    if (!text.trim() && attachments.length === 0) return;
    if (isBusyRef.current || queuedRef.current.length > 0) {
      enqueuePrompt(text, attachments);
      setInputVal('');
      return;
    }
    await runPrompt({ text, attachments });
  }, [enqueuePrompt, queuedRef, runPrompt]);

  useEffect(() => {
    if (isBusy || queueRunningRef.current || queuedPrompts.length === 0) return;
    const next = takeNextPrompt();
    if (!next) return;
    queueRunningRef.current = true;
    void runPrompt(next).finally(() => { queueRunningRef.current = false; });
  }, [isBusy, queuedPrompts.length, runPrompt, takeNextPrompt]);

  return { inputVal, setInputVal, handleSend, clearQueue, queuedPrompts, isLoading, hasStreamingAssistant, cancel };
}

function mergeDocumentSources(current: ChatDocumentSource[], incoming: ChatDocumentSource[]): ChatDocumentSource[] {
  const sources = new Map(current.map(source => [source.id, source]));
  incoming.forEach(source => sources.set(source.id, source));
  return [...sources.values()].slice(-4);
}
