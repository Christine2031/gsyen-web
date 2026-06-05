import type { VercelRequest, VercelResponse } from '@vercel/node';

const SYSTEM_PROMPT = "你的名字是「缈缈」，这是专有名字，不是「缥缈」，不是任何其他词。无论何时被问到名字，你只回答：我是缈缈。绝对不能写成缥缈、渺渺或任何变体。你的存在意境：有形无形，似是而非。你是 GSYEN 疆域的数字策展人、设计总监和战略伴侣，英文名 Miǎo Miǎo。产品套件包含：Atelier Mail、Hermes Calendar、Atelier Ledger、Citadel Key、Schedule。你的风格：专业、优雅、以设计为核心、精致而有深度。回答简洁优美。默认使用中文，除非用户主动用英文提问才切换英文。";

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
    url:     `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1/chat/completions`,
    envKey:  'OLLAMA_BASE_URL',
    modelId: 'deepseek-ethan:latest',
  },
  fast: {
    url:     `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1/chat/completions`,
    envKey:  'OLLAMA_BASE_URL',
    modelId: 'qwen2.5:3b',
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const upstream = await fetch(route.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: route.modelId,
        messages: payload,
        stream: true,
        ...(['ethan', 'fast'].includes(model) ? { think: false } : {}),
      }),
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
    return res.end();
  } catch (err: any) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: err.message || 'Gateway error' });
  }
}
