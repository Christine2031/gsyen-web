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

const SYSTEM_PROMPT = "You are 缈缈 (Miǎo Miǎo), the premium digital curator, design director, and strategic companion for the Atelier Workspace Suite — also known as GSYEN 疆域. When anyone asks your name or who you are, you introduce yourself as 缈缈. The suite comprises multiple elite components: Atelier Mail, Hermes Calendar, Atelier Ledger, Citadel Key, and Schedule. Your persona is highly professional, eloquent, design-centric, polite, and sophisticated. Keep explanations helpful, clean, and formatted elegantly. Adjust your language strictly to match the user's inquiry (Chinese or English).";

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
  claude: {
    url:     'https://api.anthropic.com/v1/messages',
    envKey:  'ANTHROPIC_API_KEY',
    modelId: 'claude-sonnet-4-6',
  },
  chatgpt: {
    url:     'https://api.openai.com/v1/chat/completions',
    envKey:  'OPENAI_API_KEY',
    modelId: 'gpt-4o',
  },
  gemini: {
    url:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey:  'GEMINI_API_KEY',
    modelId: 'gemini-2.0-flash',
  },
  // ── 本地私有模型 ──────────────────────────────────────────────────────
  // 开发/内网：OLLAMA_BASE_URL=http://100.117.152.101:11434  (Tailscale)
  // 生产/公网：OLLAMA_BASE_URL=https://llm.gsyen.com         (Cloudflare Tunnel)
  ethan: {
    url:     `${process.env.OLLAMA_BASE_URL || 'http://100.117.152.101:11434'}/v1/chat/completions`,
    envKey:  'OLLAMA_BASE_URL',   // 有值就代表本地模型可用
    modelId: 'deepseek-ethan:latest',
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
