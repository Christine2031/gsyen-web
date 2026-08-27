import type { VercelRequest, VercelResponse } from './vercelHttpTypes';

const MODEL_ROUTES: Record<string, { envKey: string; testUrl?: string }> = {
  kimi:     { envKey: 'MOONSHOT_API_KEY',  testUrl: 'https://api.moonshot.cn/v1/models' },
  deepseek: { envKey: 'DEEPSEEK_API_KEY',  testUrl: 'https://api.deepseek.com/v1/models' },
  chatgpt:  { envKey: 'OPENAI_API_KEY',    testUrl: 'https://api.openai.com/v1/models' },
  'chatgpt-pro': { envKey: 'CODEX_CLI_PATH' },
  ethan:    { envKey: 'OLLAMA_BASE_URL' },
  fast:     { envKey: 'OLLAMA_BASE_URL' },
};

async function verifyCloudModel(testUrl: string, apiKey: string): Promise<{ available: boolean; error?: string }> {
  try {
    const r = await fetch(testUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) return { available: true };
    if (r.status === 401) return { available: false, error: 'INVALID API KEY' };
    return { available: false, error: `SERVICE ERROR ${r.status}` };
  } catch {
    return { available: false, error: 'CONNECTION TIMEOUT' };
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let ollamaAlive = false;
  try {
    const r = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
    ollamaAlive = r.ok;
  } catch {}

  const models: Record<string, { available: boolean; error?: string }> = {};

  await Promise.all(
    Object.entries(MODEL_ROUTES).map(async ([modelId, route]) => {
      if (modelId === 'chatgpt-pro') {
        models[modelId] = { available: false, error: 'LOCAL ONLY' };
        return;
      }

      if (modelId === 'ethan' || modelId === 'fast') {
        models[modelId] = ollamaAlive ? { available: true } : { available: false, error: 'MODEL UNAVAILABLE' };
        return;
      }

      const apiKey = process.env[route.envKey];
      if (!apiKey) {
        models[modelId] = { available: false, error: 'API KEY MISSING' };
        return;
      }

      if (route.testUrl) {
        models[modelId] = await verifyCloudModel(route.testUrl, apiKey);
      } else {
        models[modelId] = { available: true };
      }
    })
  );

  res.json({ status: 'ok', ollamaAlive, models });
}
