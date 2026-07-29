import { useCallback, useRef, useState } from 'react';
import { ChatAttachment, ChatDocumentSource, ChatQueuedPrompt } from '../types/chat';

export function useChatPromptQueue() {
  const [queuedPrompts, setQueuedPrompts] = useState<ChatQueuedPrompt[]>([]);
  const queuedRef = useRef<ChatQueuedPrompt[]>([]);

  const sync = useCallback((next: ChatQueuedPrompt[]) => {
    queuedRef.current = next;
    setQueuedPrompts(next);
  }, []);

  const enqueuePrompt = useCallback((text: string, attachments: Array<ChatAttachment | ChatDocumentSource> = []) => {
    const prompt: ChatQueuedPrompt = {
      id: `queued-${Date.now()}-${queuedRef.current.length}`,
      text,
      attachments,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    sync([...queuedRef.current, prompt]);
  }, [sync]);

  const takeNextPrompt = useCallback(() => {
    const [next, ...rest] = queuedRef.current;
    if (next) sync(rest);
    return next;
  }, [sync]);

  const clearQueue = useCallback(() => sync([]), [sync]);

  return { queuedPrompts, queuedRef, enqueuePrompt, takeNextPrompt, clearQueue };
}
