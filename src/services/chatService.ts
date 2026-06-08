import { ChatMessage } from '../types/chat';

/** POST to the AI gateway, returns the raw Response */
export async function sendToGateway(
  model: string,
  messages: ChatMessage[],
  events?: Array<{ id: string; title: string; date: string; time: string }>,
  scheduleIntent?: string | null
): Promise<Response> {
  // 传客户端本地日期，避免 Vercel UTC 和中国时区差8小时
  const d = new Date();
  const clientDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      events: events ?? [],
      clientDate,
      scheduleIntent: scheduleIntent ?? null,
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
