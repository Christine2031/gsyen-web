import { firstEnabledModel, isModelId, type ModelId } from '../config/models';
import { sendToGateway, readSSEStream, ChatGptBridgeUnavailableError } from '../services/chatService';
import { chatSessionStore } from '../stores/chatSessionStore';
import type { ChatMessage } from '../types/chat';
import { chatToCanvasSession } from './canvasCodeAskCommand';

const CURRENT_SESSION_KEY = 'gsyen_current_session_id';
const MODEL_KEY = 'gsyen-last-closed-model';

interface CanvasModelTurnOptions {
  sessionId?: string;
  query: string;
  lang: 'zh' | 'en';
  context?: string;
  userAlreadySaved?: boolean;
  onToken?: (text: string) => void;
}

function timeLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function readCurrentMainModel(): ModelId {
  const stored = localStorage.getItem(MODEL_KEY);
  return isModelId(stored) ? stored : firstEnabledModel();
}

function readBaseMessages(sessionId: string) {
  const session = chatSessionStore.loadAll().find(item => item.id === sessionId);
  return session?.messages ?? chatSessionStore.loadCurrentChat();
}

function withCanvasContext(messages: ChatMessage[], context?: string) {
  if (!context) return messages;
  const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
  if (lastUserIndex < 0) return messages;
  return messages.map((message, index) => index === lastUserIndex
    ? { ...message, content: `${message.content}\n\n[Canvas context]\n${context}` }
    : message
  );
}

function persist(sessionId: string, messages: ChatMessage[], model: ModelId) {
  localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
  chatSessionStore.saveCurrentChat(messages);
  chatSessionStore.upsert(sessionId, messages, model);
  window.dispatchEvent(new CustomEvent('chat-sessions-updated'));
  window.dispatchEvent(new CustomEvent('gsyen-chat-session-mutated', {
    detail: { sessionId, messages },
  }));
}

export async function runCanvasModelTurn({
  sessionId,
  query,
  lang,
  context,
  userAlreadySaved = false,
  onToken,
}: CanvasModelTurnOptions) {
  const model = readCurrentMainModel();
  const id = sessionId ?? localStorage.getItem(CURRENT_SESSION_KEY) ?? crypto.randomUUID();
  const base = readBaseMessages(id);
  const stamp = Date.now();
  const userMessage: ChatMessage = { id: `user-${stamp}`, role: 'user', content: query, timestamp: timeLabel() };
  const withUser = userAlreadySaved ? base : [...base, userMessage];
  persist(id, withUser, model);

  try {
    const response = await sendToGateway(model, withCanvasContext(withUser, context));
    const contentType = response.headers.get('content-type') ?? '';
    let full = '';

    if (contentType.includes('text/event-stream')) {
      for await (const delta of readSSEStream(response)) {
        full += delta;
        onToken?.(full);
      }
    } else {
      const data = await response.json();
      full = data.text ?? (lang === 'zh' ? '抱歉，模型没有返回有效回复。' : 'The model returned an empty reply.');
      onToken?.(full);
    }

    const assistant: ChatMessage = { id: `ai-${stamp}`, role: 'model', content: full || '…', timestamp: timeLabel() };
    const messages = [...withUser, assistant];
    persist(id, messages, model);
    return { sessionId: id, messages, canvasMessages: chatToCanvasSession(messages), model };
  } catch (err) {
    const content = err instanceof ChatGptBridgeUnavailableError
      ? (lang === 'zh'
        ? 'ChatGPT 本机桥没有连接。请确认主聊天里的 CHATGPT 已在线，再回到 canvas 继续。'
        : 'The local ChatGPT bridge is offline. Please connect CHATGPT in the main session first.')
      : (lang === 'zh'
        ? '模型连接失败。这个 session 仍然保留在主聊天里，可以稍后继续。'
        : 'The model connection failed. This session was kept and can be continued later.');
    onToken?.(content);
    const assistant: ChatMessage = { id: `ai-${stamp}`, role: 'model', content, timestamp: timeLabel() };
    const messages = [...withUser, assistant];
    persist(id, messages, model);
    return { sessionId: id, messages, canvasMessages: chatToCanvasSession(messages), model };
  }
}
