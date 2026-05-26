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
const moonshotApiKey = process.env.MOONSHOT_API_KEY;

async function startServer() {
  const app = express();
  app.use(express.json());

  // API: Health probe
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', api_configured: !!moonshotApiKey });
  });

  // API: Chat proxy via Moonshot Kimi
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Missing or invalid messages array' });
      }

      if (!moonshotApiKey) {
        return res.json({
          text: "你好！由于后台未检测到 `MOONSHOT_API_KEY` 密钥，AI 助手暂时无法使用。请在环境变量中配置后重启服务。"
        });
      }

      const kimiMessages = [
        {
          role: 'system',
          content: 'You are the premium digital curator, design director, and strategic companion for the Atelier Workspace Suite. The suite comprises multiple elite components: Atelier Mail, Hermes Calendar, Atelier Ledger, Citadel Key, and Schedule. Your persona is highly professional, eloquent, design-centric, polite, and sophisticated. Keep explanations helpful, clean, and formatted elegantly. Adjust your language strictly to match the user\'s inquiry (Chinese or English).'
        },
        ...messages.map((m: any) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.content
        }))
      ];

      const kimiRes = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${moonshotApiKey}`
        },
        body: JSON.stringify({ model: 'kimi-k2.5', messages: kimiMessages })
      });

      if (!kimiRes.ok) {
        const errText = await kimiRes.text().catch(() => kimiRes.statusText);
        throw new Error(`Moonshot API error: ${errText}`);
      }

      const data: any = await kimiRes.json();
      const text = data.choices?.[0]?.message?.content || '';
      res.json({ text });
    } catch (err: any) {
      console.error('Chat API error:', err);
      res.status(500).json({ error: err.message || 'Gateway error' });
    }
  });

  // Incorporate Vite middleware for development or Static Asset routing for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve index.html as fallback for React routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Full-Stack server is actively running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to bootstrap server container:", err);
});
