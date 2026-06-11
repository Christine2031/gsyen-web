import type { VercelRequest, VercelResponse } from '@vercel/node';

const MODEL_ROUTES: Record<string, { envKey: string }> = {
  kimi:     { envKey: 'MOONSHOT_API_KEY' },
  deepseek: { envKey: 'DEEPSEEK_API_KEY' },
  gemini:   { envKey: 'GEMINI_API_KEY' },
  ethan:    { envKey: 'OLLAMA_BASE_URL' },
  fast:     { envKey: 'OLLAMA_BASE_URL' },
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let ollamaAlive = false;
  try {
    const r = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
    ollamaAlive = r.ok;
  } catch {}

  const models: Record<string, any> = {};
  for (const [modelId, route] of Object.entries(MODEL_ROUTES)) {
    const hasKey = !!process.env[route.envKey];
    if (modelId === 'ethan' || modelId === 'fast') {
      models[modelId] = { available: ollamaAlive };
      if (!ollamaAlive) models[modelId].error = 'MODEL UNAVAILABLE';
    } else {
      models[modelId] = { available: hasKey };
      if (!hasKey) models[modelId].error = 'API KEY MISSING';
    }
  }
  res.json({ status: 'ok', ollamaAlive, models });
}
