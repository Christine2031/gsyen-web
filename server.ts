/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = 3000;

const SYSTEM_PROMPT = "You are the premium digital curator, design director, and strategic companion for the Atelier Workspace Suite. The suite comprises multiple elite components: Atelier Mail, Hermes Calendar, Atelier Ledger, Citadel Key, and Schedule. Your persona is highly professional, eloquent, design-centric, polite, and sophisticated. Keep explanations helpful, clean, and formatted elegantly. Adjust your language strictly to match the user's inquiry (Chinese or English).";

// ── Model routing table ──────────────────────────────────────────────────
// To add a new model: append one entry here, set the env key, done.
const MODEL_ROUTES: Record<string, { url: string; envKey: string; modelId: string }> = {
  kimi: {
    url:     'https://api.moonshot.cn/v1/chat/completions',
    envKey:  'MOONSHOT_API_KEY',
    modelId: 'kimi-k2.5',
  },
  deepseek: {
    url:     'https://api.deepseek.com/v1/chat/completions',
    envKey:  'DEEPSEEK_API_KEY',
    modelId: 'deepseek-chat',
  },
};
// ────────────────────────────────────────────────────────────────────────

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
      const { messages, model = 'kimi' } = req.body;
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
          text: `后台未检测到 \`${route.envKey}\` 密钥，请在环境变量中配置后重启服务。`
        });
      }

      const payload = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m: any) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.content,
        })),
      ];

      const upstream = await fetch(route.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: route.modelId, messages: payload }),
      });

      if (!upstream.ok) {
        const err = await upstream.text().catch(() => upstream.statusText);
        throw new Error(`${model} API error: ${err}`);
      }

      const data: any = await upstream.json();
      res.json({ text: data.choices?.[0]?.message?.content || '' });
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
