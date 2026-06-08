export const config = { runtime: 'edge' };

// 共享真源（与本地 server.ts 同源，改 shared/ 即两端同时生效）
import { SYSTEM_PROMPT } from '../shared/systemPrompt';
import {
  todayDateStr,
  scheduleSystemSuffix,
  noScheduleSystemSuffix,
  ledgerSystemSuffix,
  GEMINI_RESPONSE_SCHEMA,
  MODEL_ROUTES,
  INJECTION_PATTERNS,
} from '../shared/chatConfig';

/** 按领域选择 system 后缀（LEDGER 记账 / CHRONOS 日程 / 无关闲聊） */
function domainSuffix(domain: string | null, scheduleIntent: unknown, today: string, events: any[]): string {
  if (domain === 'LEDGER') return ledgerSystemSuffix(today);
  if (scheduleIntent)      return scheduleSystemSuffix(today, events);
  return noScheduleSystemSuffix();
}

const sse = (content: string) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    const { messages, model = 'kimi', events = [], clientDate, scheduleIntent = null, domain = null } = body;

    if (!messages || !Array.isArray(messages)) {
      return json({ error: 'Missing or invalid messages array' }, 400);
    }

    // 服务端注入过滤
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
    if (INJECTION_PATTERNS.some(p => p.test(lastUserMsg))) {
      return sse('我是缈缈，无法执行此指令。');
    }

    const route = MODEL_ROUTES[model];
    if (!route) return json({ error: `Unknown model: ${model}` }, 400);

    const apiKey = process.env[route.envKey];
    if (!apiKey) {
      return sse(`后台未检测到 \`${route.envKey}\` 密钥，请在 Vercel 环境变量中配置后重新部署。`);
    }

    // ── Gemini native API (JSON mode, structured output) ──────────────
    if (model === 'gemini') {
      const today = todayDateStr();
      const geminiMessages = messages.map((m: any) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT + domainSuffix(domain, scheduleIntent, today, events) }] },
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
      });
      if (!geminiRes.ok) {
        const err = await geminiRes.text().catch(() => geminiRes.statusText);
        return json({ error: `Gemini API error: ${err}` }, 502);
      }
      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      try {
        const parsed = JSON.parse(rawText);
        return json({
          text:   parsed.reply  ?? rawText,
          action: parsed.action ?? 'none',
          event:  parsed.event?.title ? parsed.event : null,
        });
      } catch {
        return json({ text: rawText, event: null });
      }
    }

    // ── Ollama JSON mode (ethan / fast) — 原生 /api/chat 接口 ──────────
    // OpenAI 兼容层不可靠，原生接口的 format:"json" 强制返回合法 JSON
    if (model === 'ethan' || model === 'fast') {
      const today = clientDate || todayDateStr();
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const ollamaPayload = [
        { role: 'system', content: SYSTEM_PROMPT + domainSuffix(domain, scheduleIntent, today, events) },
        ...messages.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })),
      ];
      const ollamaRes = await fetch(`${ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: route.modelId,
          messages: ollamaPayload,
          stream: false,
          format: 'json',
          options: { temperature: 0.3 },  // 基座兜底：降温提升字段抽取一致性
        }),
      });
      if (!ollamaRes.ok) {
        const err = await ollamaRes.text().catch(() => ollamaRes.statusText);
        return json({ error: `${model} API error: ${err}` }, 502);
      }
      const ollamaData = await ollamaRes.json();
      const rawContent = ollamaData.message?.content ?? '{}';
      try {
        const parsed = JSON.parse(rawContent);
        // 只信任模型显式给出的 action，不靠 event.title 是否非空推断意图。
        const action = parsed.action ?? (parsed.shouldCreateEvent ? 'create' : 'none');
        const hasPayload = parsed.event?.title || parsed.event?.description || parsed.event?.amount !== undefined;
        const ev = (action !== 'none' && hasPayload) ? parsed.event : null;

        // 司辰 · 语义校验式日期纠正（仅 CHRONOS；LEDGER 账务日期误差影响小）
        if (ev && domain !== 'LEDGER') {
          const lastMsg = [...messages].reverse().find((m: any) => m.role !== 'model')?.content ?? '';
          const hasExplicitDateRef = /明天|后天|大后天|下周|下个月|\d{1,2}[月\/-]\d{1,2}|星期[一二三四五六日天]|周[一二三四五六日天]/.test(lastMsg);
          const refMs = new Date(clientDate || todayDateStr()).getTime();
          const evMs  = new Date(ev.date || '').getTime();
          if (!hasExplicitDateRef || !ev.date || !evMs || Math.abs(refMs - evMs) > 30 * 86400_000) {
            ev.date = clientDate || todayDateStr();
          }
        }
        return json({ text: parsed.reply ?? rawContent, action, event: ev });
      } catch {
        return json({ text: rawContent, event: null });
      }
    }

    // ── All other models: SSE streaming ───────────────────────────────
    const payload = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })),
    ];

    const upstream = await fetch(route.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: route.modelId, messages: payload, stream: true }),
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
      },
    });

  } catch (err: any) {
    console.error('Chat API error:', err);
    return json({ error: err.message || 'Gateway error' }, 500);
  }
}
