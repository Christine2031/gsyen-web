/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

// 共享真源（与 api/chat.ts 同源，改 shared/ 即两端同时生效）
import { SYSTEM_PROMPT } from './shared/systemPrompt';
import { MODEL_ROUTES } from './shared/chatConfig';
import { runOllamaStructuredChat, hitsInjection, INJECTION_REPLY } from './shared/structuredChat';
import { streamCodexChatResponse } from './server/codexChatStream';
import { registerCodexRoutes } from './server/codexRoutes';
import { registerLocalBridgeCors } from './server/localBridgeCors';
import { toOpenAiMessages } from './shared/providerMessages';
import { chatAccessHeaders, enforceChatAccess } from './shared/chatAccess';
import {
  requireLocalBridgeToken,
  resolveChatAccessMode,
} from './server/localBridgeAuth';
import { validateChatRequestBody } from './shared/chatRequest';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000'); // 与 gsyen-api 一致：可用 PORT 覆盖，便于并行实例/冒烟测试
type HealthResult = { available: boolean; error?: string; authMode?: string };

async function startServer() {
  const app = express();
  registerLocalBridgeCors(app);
  app.use(express.json({ limit: '18mb' }));
  registerCodexRoutes(app);

  // Health probe — real API verification
  const healthCache: Record<string, HealthResult & { timestamp: number }> = {};
  const HEALTH_CACHE_TTL = 30_000; // 30s cache

  async function verifyModel(modelId: string, route: any): Promise<HealthResult> {
    const now = Date.now();
    const cached = healthCache[modelId];
    if (cached && now - cached.timestamp < HEALTH_CACHE_TTL) {
      return { available: cached.available, error: cached.error, authMode: cached.authMode };
    }

    if (modelId === 'chatgpt-pro') {
      const result = { available: false, error: 'LOCAL BRIDGE AUTH REQUIRED' };
      healthCache[modelId] = { ...result, timestamp: now };
      return result;
    } else if (modelId === 'ethan' || modelId === 'fast') {
      // 本地模型：检查 Ollama 服务
      const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      try {
        const r = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
        const result = { available: r.ok, ...(r.ok ? {} : { error: 'MODEL UNAVAILABLE' }) };
        healthCache[modelId] = { ...result, timestamp: now };
        return result;
      } catch (e) {
        const result = { available: false, error: 'SERVICE UNREACHABLE' };
        healthCache[modelId] = { ...result, timestamp: now };
        return result;
      }
    } else {
      // 云模型：检查 API key 存在 + 简单可用性验证
      const apiKey = process.env[route.envKey];
      if (!apiKey) {
        const result = { available: false, error: 'API_KEY_MISSING' };
        healthCache[modelId] = { ...result, timestamp: now };
        return result;
      }

      // 简单的可用性验证（不发费用请求，只检查 endpoint）
      try {
        let testUrl = '';
        if (modelId === 'kimi') {
          testUrl = 'https://api.moonshot.cn/v1/models';
        } else if (modelId === 'deepseek') {
          testUrl = 'https://api.deepseek.com/v1/models';
        } else if (modelId === 'chatgpt') {
          testUrl = 'https://api.openai.com/v1/models';
        }

        if (testUrl) {
          const r = await fetch(testUrl, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          const available = r.ok || r.status === 401; // 401 = key invalid，但至少 service 在线
          const result = available
            ? { available: r.ok, ...(r.ok ? {} : { error: 'API_KEY_INVALID' }) }
            : { available: false, error: 'SERVICE_UNREACHABLE' };
          healthCache[modelId] = { ...result, timestamp: now };
          return result;
        }
      } catch (e) {
        const result = { available: false, error: 'CONNECTION_TIMEOUT' };
        healthCache[modelId] = { ...result, timestamp: now };
        return result;
      }
    }
    return { available: false, error: 'UNKNOWN' };
  }

  app.get('/api/health', async (_req, res) => {
    // 并行探测：串行时全离线要叠加多个 5s 超时（前端每 30s ping 一次会堆积）
    const entries = Object.entries(MODEL_ROUTES);
    const results = await Promise.all(entries.map(([modelId, route]) => verifyModel(modelId, route)));
    const models: Record<string, any> = {};
    entries.forEach(([modelId], i) => { models[modelId] = results[i]; });
    res.json({ status: 'ok', models });
  });

  // Chat proxy — model-agnostic
  app.post('/api/chat', async (req, res) => {
    try {
      const validation = validateChatRequestBody(req.body);
      if (validation.ok === false) {
        return res.status(validation.status).json({
          error: validation.message,
          code: validation.code,
        });
      }
      const { messages, model = 'kimi', events = [], clientDate, scheduleIntent = null, domain = null, chatGptModel = null } = req.body;

      const route = MODEL_ROUTES[model];
      if (!route) {
        return res.status(400).json({ error: `Unknown model: ${model}` });
      }

      const accessMode = resolveChatAccessMode(
        model,
        req.headers['x-gsyen-bridge-token'],
      );
      if (accessMode === 'reject') {
        if (!requireLocalBridgeToken(req, res)) return;
      } else if (accessMode === 'cloud') {
        const requestHeaders = new Headers();
        if (typeof req.headers.authorization === 'string') {
          requestHeaders.set('Authorization', req.headers.authorization);
        }
        const access = await enforceChatAccess(requestHeaders);
        const quotaHeaders = chatAccessHeaders(access);
        Object.entries(quotaHeaders).forEach(([name, value]) => res.setHeader(name, value));
        if (access.ok === false) {
          return res.status(access.status).json({ error: access.message, code: access.code });
        }
      }

      // 服务端注入过滤（与 api/chat.ts 同源；此前只有 Vercel 版有）
      if (hitsInjection(messages)) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: INJECTION_REPLY } }] })}\n\ndata: [DONE]\n\n`);
        return res.end();
      }

      if (model === 'chatgpt-pro') {
        return streamCodexChatResponse(req, res, {
          messages,
          systemPrompt: SYSTEM_PROMPT,
          domain,
          chatGptModel,
        });
      }

      // ── Ollama JSON mode (ethan / fast)：先于密钥检查——OLLAMA_BASE_URL
      // 有 localhost 兜底，不设也能跑，不该被"缺密钥"短路。
      if (model === 'ethan' || model === 'fast') {
        const { status, body } = await runOllamaStructuredChat({
          model, modelId: route.modelId, systemPrompt: SYSTEM_PROMPT,
          messages, events, clientDate, scheduleIntent, domain,
        });
        return res.status(status).json(body);
      }

      const apiKey = process.env[route.envKey];
      if (!apiKey) {
        return res.json({
          text: `后台未检测到 \`${route.envKey}\` 密钥，请在环境变量中配置后重启服务。`,
        });
      }

      // ── All other models: SSE streaming ───────────────────────────────
      const payload = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...toOpenAiMessages(messages, model === 'chatgpt'),
      ];

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');

      const upstream = await fetch(route.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: route.modelId, messages: payload, stream: true }),
        signal: AbortSignal.timeout(300_000), // 硬上限 5 分钟：上游挂起时连接不再永久悬挂
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

  const apiOnly = process.env.API_ONLY === 'true';
  if (!apiOnly && process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else if (!apiOnly) {
    const dist = path.join(process.cwd(), 'dist');
    // HTML is the deployment manifest: never let a browser or CDN retain an
    // old document that references a previous bundle. Vite asset filenames
    // contain a content hash, so those files can safely be immutable.
    app.use(express.static(dist, {
      index: false,
      setHeaders(res, filePath) {
        const hashedAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|css|mjs|map)$/
          .test(path.basename(filePath));
        res.setHeader(
          'Cache-Control',
          hashedAsset
            ? 'public, max-age=31536000, immutable'
            : 'no-cache, max-age=0, must-revalidate',
        );
      },
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  const server = app.listen(PORT, '127.0.0.1', () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : PORT;
    process.send?.({ type: 'gsyen-api-ready', port: actualPort });
    console.log(`Atelier Full-Stack server is actively running on http://127.0.0.1:${actualPort}`);
  });
}

startServer().catch(err => {
  console.error('Failed to bootstrap server container:', err);
});
