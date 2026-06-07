const PREDICT_API =
  (import.meta as any).env?.VITE_PREDICT_API ?? 'http://127.0.0.1:8000';

/**
 * Ask the local 老陈 prediction expert.
 * Returns an answer string if the expert matched, otherwise null
 * (caller should fall through to the general AI gateway).
 */
export async function askPredictionExpert(text: string): Promise<string | null> {
  // 未显式配置 VITE_PREDICT_API 时跳过，避免生产环境控制台报错
  if (!(import.meta as any).env?.VITE_PREDICT_API) return null;
  try {
    const res = await fetch(`${PREDICT_API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data['专家'] && data['专家'] !== '无' ? (data.answer as string) : null;
  } catch {
    // Local service not running — silently fall through
    return null;
  }
}
