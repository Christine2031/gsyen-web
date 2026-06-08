/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

// 共享真源（与 api/chat.ts 同源，改 shared/ 即两端同时生效）
import { SYSTEM_PROMPT } from './shared/systemPrompt';
import {
  todayDateStr,
  scheduleSystemSuffix,
  noScheduleSystemSuffix,
  ledgerSystemSuffix,
  GEMINI_RESPONSE_SCHEMA,
  MODEL_ROUTES,
} from './shared/chatConfig';

dotenv.config();

const PORT = 3000;

/** 按领域选择 system 后缀（LEDGER 记账 / CHRONOS 日程 / 无关闲聊） */
function domainSuffix(domain: string | null, scheduleIntent: unknown, today: string, events: any[]): string {
  if (domain === 'LEDGER') return ledgerSystemSuffix(today);
  if (scheduleIntent)      return scheduleSystemSuffix(today, events);
  return noScheduleSystemSuffix();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health probe
  app.get('/api/health', (_req, res) => {
    const configured = Object.fromEntries(
      Object.entries(MODEL_ROUTES).map(([k, v]) => [k, !!process.env[v.envKey]])
    );
    res.json({ status: 'ok', models: configured });
  });

  // Chat proxy — model-agnostic
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, model = 'kimi', events = [], clientDate, scheduleIntent = null, domain = null } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Missing or invalid messages array' });
      }

      const route = MODEL_ROUTES[model];
      if (!route) {
        return res.status(400).json({ error: `Unknown model: ${model}` });
      }

      const apiKey = process.env[route.envKey];
      if (!apiKey) {
        return res.json({
          text: `后台未检测到 \`${route.envKey}\` 密钥，请在环境变量中配置后重启服务。`,
        });
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
          return res.status(502).json({ error: `Gemini API error: ${err}` });
        }
        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
        try {
          const parsed = JSON.parse(rawText);
          return res.json({
            text:   parsed.reply  ?? rawText,
            action: parsed.action ?? 'none',
            event:  parsed.event?.title ? parsed.event : null,
          });
        } catch {
          return res.json({ text: rawText, action: 'none', event: null });
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
          return res.status(502).json({ error: `${model} API error: ${err}` });
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
            const lastUserMsg = [...messages].reverse().find((m: any) => m.role !== 'model')?.content ?? '';
            const hasExplicitDateRef = /明天|后天|大后天|下周|下个月|\d{1,2}[月\/-]\d{1,2}|星期[一二三四五六日天]|周[一二三四五六日天]/.test(lastUserMsg);
            const refMs = new Date(clientDate || todayDateStr()).getTime();
            const evMs  = new Date(ev.date || '').getTime();
            if (!hasExplicitDateRef || !ev.date || !evMs || Math.abs(refMs - evMs) > 30 * 86400_000) {
              ev.date = clientDate || todayDateStr();
            }
          }
          return res.json({ text: parsed.reply ?? rawContent, action, event: ev });
        } catch {
          return res.json({ text: rawContent, action: 'none', event: null });
        }
      }

      // ── All other models: SSE streaming ───────────────────────────────
      const payload = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m: any) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })),
      ];

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');

      const upstream = await fetch(route.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: route.modelId, messages: payload, stream: true }),
      });

      if (!upstream.ok) {
        const err = await upstream.text().catch(() => upstream.statusText);
        res.end(`data: ${JSON.stringify({ error: `${model} API error: ${err}` })}\n\n`);
        return;
      }

      const reader = (upstream.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    } catch (err: any) {
      console.error('Chat API error:', err);
      res.status(500).json({ error: err.message || 'Gateway error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Full-Stack server is actively running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to bootstrap server container:', err);
});
