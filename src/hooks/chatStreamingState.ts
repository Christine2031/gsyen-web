import type { ChatMessage } from '../types/chat';

export function settleInterruptedAssistant(messages: ChatMessage[], assistantId: string): ChatMessage[] {
  const message = messages.find(item => item.id === assistantId);
  if (!message?.streaming) return messages;
  if (!message.content && !message.card) {
    return messages.filter(item => item.id !== assistantId);
  }
  return messages.map(item => item.id === assistantId ? { ...item, streaming: false } : item);
}
