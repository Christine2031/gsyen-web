import { ChatMessage } from '../types/chat';
import { probeLocalChatGptBridge } from './localBridge';
import { normalizeChatGptModel } from '../config/models';
import { getChatAccessToken } from '../auth/chatAccessToken';

export class ChatGptBridgeUnavailableError extends Error {
  detail?: string;

  constructor(detail?: string) {
    super('CHATGPT_LOCAL_BRIDGE_OFFLINE');
    this.name = 'ChatGptBridgeUnavailableError';
    this.detail = detail;
  }
}

/** POST to the AI gateway, returns the raw Response */
export async function sendToGateway(
  model: string,
  messages: ChatMessage[],
  events?: Array<{ id: string; title: string; date: string; time: string }>,
  scheduleIntent?: string | null,
  /** Which domain module owns this request — tells the backend which system suffix to inject */
  domain?: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  // 传客户端本地日期，避免 Vercel UTC 和中国时区差8小时
  const d = new Date();
  const clientDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let bridgeBase = '';
  let bridgeHeaders: Record<string, string> = {};
  if (model === 'chatgpt-pro') {
    const probe = await probeLocalChatGptBridge();
    if (probe?.health.status !== 'online') {
      throw new ChatGptBridgeUnavailableError(probe?.health.error);
    }
    bridgeBase = probe.base;
    bridgeHeaders = probe.headers;
  }
  const savedChatGptModel = localStorage.getItem('gsyen-chatgpt-model');
  const chatGptModel = model === 'chatgpt-pro'
    ? normalizeChatGptModel(savedChatGptModel)
    : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (model === 'chatgpt-pro') {
    Object.assign(headers, bridgeHeaders);
  } else {
    const accessToken = await getChatAccessToken();
    if (!accessToken) throw new Error('AUTH_REQUIRED');
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(`${bridgeBase}/api/chat`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments ?? [],
        documentContext: m.documentContext,
      })),
      events: events ?? [],
      clientDate,
      scheduleIntent: scheduleIntent ?? null,
      domain: domain ?? null,
      chatGptModel,
    }),
  });
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  return res;
}

/**
 * Async generator that yields text deltas from a Server-Sent Events stream.
 * Caller drives the iteration; no React dependency.
 */
export async function* readSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const delta = JSON.parse(raw).choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta as string;
      } catch {
        // malformed SSE chunk — skip
      }
    }
  }
}
