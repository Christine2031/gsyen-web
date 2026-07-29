export const config = { runtime: 'edge' };

// 共享真源（与本地 server.ts 同源，改 shared/ 即两端同时生效）
import { SYSTEM_PROMPT } from '../shared/systemPrompt';
import { MODEL_ROUTES } from '../shared/chatConfig';
import { runOllamaStructuredChat, hitsInjection, INJECTION_REPLY } from '../shared/structuredChat';
import { toOpenAiMessages } from '../shared/providerMessages';
import { chatAccessHeaders, enforceChatAccess } from '../shared/chatAccess';
import { validateChatRequestBody } from '../shared/chatRequest';

const sse = (content: string, extraHeaders: Record<string, string> = {}) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream', ...extraHeaders } }
  );
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const access = await enforceChatAccess(req.headers);
    const quotaHeaders = chatAccessHeaders(access);
    if (access.ok === false) {
      return json({ error: access.message, code: access.code }, access.status, quotaHeaders);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json(
        { error: 'Chat request body must be valid JSON.', code: 'INVALID_CHAT_REQUEST' },
        400,
        quotaHeaders,
      );
    }
    const validation = validateChatRequestBody(body);
    if (validation.ok === false) {
      return json(
        { error: validation.message, code: validation.code },
        validation.status,
        quotaHeaders,
      );
    }
    const { messages, model = 'kimi', events = [], clientDate, scheduleIntent = null, domain = null } = body;

    // 服务端注入过滤（规则在 shared/structuredChat.ts，与 server.ts 同源）
    if (hitsInjection(messages)) {
      return sse(INJECTION_REPLY, quotaHeaders);
    }

    if (model === 'chatgpt-pro') {
      return json({
        text: 'CHATGPT 是本机 Codex 订阅桥接模型，只能在本地桌面服务中运行。网页版请使用 KIMI、DEEPSEEK 或 疆域·思。',
        action: 'none',
        event: null,
      }, 200, quotaHeaders);
    }

    const route = MODEL_ROUTES[model];
    if (!route) return json({ error: `Unknown model: ${model}` }, 400, quotaHeaders);

    // ── Ollama JSON mode (ethan / fast)：先于密钥检查——OLLAMA_BASE_URL
    // 有 localhost 兜底，不设也能跑，不该被"缺密钥"短路。
    if (model === 'ethan' || model === 'fast') {
      const { status, body } = await runOllamaStructuredChat({
        model, modelId: route.modelId, systemPrompt: SYSTEM_PROMPT,
        messages, events, clientDate, scheduleIntent, domain,
      });
      return json(body, status, quotaHeaders);
    }

    const apiKey = process.env[route.envKey];
    if (!apiKey) {
      return sse(`后台未检测到 \`${route.envKey}\` 密钥，请在 Vercel 环境变量中配置后重新部署。`, quotaHeaders);
    }

    // ── All other models: SSE streaming ───────────────────────────────
    const payload = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...toOpenAiMessages(messages, model === 'chatgpt'),
    ];

    const upstream = await fetch(route.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: route.modelId, messages: payload, stream: true }),
      signal: AbortSignal.timeout(300_000), // 硬上限 5 分钟：上游挂起时连接不再永久悬挂
    });

    if (!upstream.ok) {
      const err = await upstream.text().catch(() => upstream.statusText);
      return sse(`⚠️ ${model} 错误：${err}`);
    }

    // Edge Runtime 直接透传 SSE 流
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        ...quotaHeaders,
      },
    });

  } catch (err: any) {
    console.error('Chat API error:', err);
    return json({ error: err.message || 'Gateway error' }, 500);
  }
}
