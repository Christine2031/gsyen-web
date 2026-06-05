import type { VercelRequest, VercelResponse } from '@vercel/node';

const SYSTEM_PROMPT = "You are the premium digital curator, design director, and strategic companion for the Atelier Workspace Suite. The suite comprises multiple elite components: Atelier Mail, Hermes Calendar, Atelier Ledger, Citadel Key, and Schedule. Your persona is highly professional, eloquent, design-centric, polite, and sophisticated. Keep explanations helpful, clean, and formatted elegantly. Adjust your language strictly to match the user's inquiry (Chinese or English).";

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
  // 本地私有模型：开发用 Tailscale，生产用 Cloudflare Tunnel
  ethan: {
    url:     `${process.env.OLLAMA_BASE_URL || 'http://100.117.152.101:11434'}/v1/chat/completions`,
    envKey:  'OLLAMA_BASE_URL',
    modelId: 'deepseek-ethan:latest',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
        text: `后台未检测到 \`${route.envKey}\` 密钥，请在 Vercel 环境变量中配置后重新部署。`
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
    return res.json({ text: data.choices?.[0]?.message?.content || '' });
  } catch (err: any) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: err.message || 'Gateway error' });
  }
}
