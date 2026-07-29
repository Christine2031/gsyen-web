import { canvasStore, type CanvasDoc } from '../stores/canvasStore';
import { chatSessionStore } from '../stores/chatSessionStore';
import type { ModelId } from '../config/models';
import type { ChatMessage } from '../types/chat';

const MAP_PATH = 'C:/Users/Ethan/Desktop/01-Projects/GSYEN/GYEN-Human-Map.canvas';
const PENDING_KEY = 'gsyen_pending_canvas_ask';
const CURRENT_SESSION_KEY = 'gsyen_current_session_id';

export interface PendingCanvasAsk {
  docId: string;
  sessionId?: string;
  query: string;
  ts: number;
}

export interface CanvasSessionBubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

function timeLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function chatToCanvasSession(messages: ChatMessage[]): CanvasSessionBubble[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    text: message.content,
  }));
}

export function loadCanvasSession(sessionId?: string): CanvasSessionBubble[] {
  const id = sessionId ?? localStorage.getItem(CURRENT_SESSION_KEY) ?? undefined;
  const session = id ? chatSessionStore.loadAll().find(item => item.id === id) : null;
  return chatToCanvasSession(session?.messages ?? chatSessionStore.loadCurrentChat());
}

export function appendCanvasCodeAskToSession(
  sessionId: string | undefined,
  query: string,
  reply: string,
  model: ModelId = 'kimi',
) {
  const id = sessionId ?? localStorage.getItem(CURRENT_SESSION_KEY) ?? crypto.randomUUID();
  const session = chatSessionStore.loadAll().find(item => item.id === id);
  const base = session?.messages ?? chatSessionStore.loadCurrentChat();
  const stamp = Date.now();
  const messages: ChatMessage[] = [
    ...base,
    { id: `user-${stamp}`, role: 'user', content: query, timestamp: timeLabel() },
    { id: `ai-${stamp}`, role: 'model', content: reply, timestamp: timeLabel() },
  ];
  localStorage.setItem(CURRENT_SESSION_KEY, id);
  chatSessionStore.saveCurrentChat(messages);
  chatSessionStore.upsert(id, messages, model);
  window.dispatchEvent(new CustomEvent('chat-sessions-updated'));
  return { sessionId: id, messages, canvasMessages: chatToCanvasSession(messages) };
}

export function buildCanvasCodeAskReply(query: string, lang: 'zh' | 'en' = 'zh') {
  const zh = lang === 'zh';
  const header = /header|顶部|顶栏|隐藏|收起|拖|窗口|shell/i.test(query);
  if (!header) {
    return zh
      ? '我已打开当前 canvas 的本地代码观察。相关文件会按层级铺开，点源码卡可以看行号。'
      : 'I opened the local code map. Related files are expanded as cards with clickable line ranges.';
  }
  return zh
    ? [
        '我已建立本地代码 session，并打开 Header Drag Contract。',
        '这不是一个单文件问题：先看红色 AppHeader.tsx，再看紫色 useHiddenShellDrag / Electron IPC，黄色 CSS 是视觉和热区合同。',
        '画布里的源码卡可以直接点开本地文件，并自动高亮 Lxx-Lyy。',
      ].join('\n\n')
    : [
        'I opened a local code session for Header Drag Contract.',
        'This is not a single-file issue: start with red AppHeader.tsx, then purple useHiddenShellDrag / Electron IPC, and yellow CSS for the visual/hotzone contract.',
        'Click any code card to open the local file and highlight the Lxx-Lyy range.',
      ].join('\n\n');
}

export function isCanvasCodeAsk(text: string) {
  const q = text.trim();
  if (!q) return false;
  const wantsCode = /代码|源码|行号|文件|本地|local|source|code/i.test(q);
  const asksHeader = /header|顶部|顶栏|隐藏|收起|拖|窗口|shell/i.test(q);
  return wantsCode && asksHeader;
}

async function readHumanMapFile() {
  const api = (window as any).electronAPI;
  if (api?.readFile) {
    const text = await api.readFile(MAP_PATH);
    if (typeof text === 'string' && text.trim()) return text;
  }
  const res = await fetch(`/@fs/${MAP_PATH}`);
  return res.ok ? res.text() : '';
}

function isHumanMap(doc: CanvasDoc) {
  return doc.title === 'GYEN-Human-Map' ||
    (doc.type === 'nodes' && doc.content.includes('"id": "gsyen-core"') && doc.content.includes('"shell-drag-contract"'));
}

async function ensureHumanMapDoc() {
  const existing = canvasStore.getAll().find(isHumanMap);
  if (existing) return existing;

  const content = await readHumanMapFile();
  const now = new Date().toISOString();
  const doc: CanvasDoc = {
    id: 'gsyen-human-map',
    title: 'GYEN-Human-Map',
    content,
    type: 'nodes',
    scope: 'self',
    createdAt: now,
    updatedAt: now,
    tags: ['gsyen', 'human-map'],
  };
  canvasStore.add(doc);
  return doc;
}

export async function prepareCanvasCodeAsk(query: string, sessionId?: string): Promise<PendingCanvasAsk> {
  const doc = await ensureHumanMapDoc();
  const pending = { docId: doc.id, sessionId, query, ts: Date.now() };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  return pending;
}

export function takePendingCanvasAsk(docId: string): PendingCanvasAsk | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingCanvasAsk;
    if (pending.docId !== docId || Date.now() - pending.ts > 10000) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return pending;
  } catch {
    return null;
  }
}
