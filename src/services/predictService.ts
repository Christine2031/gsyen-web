import { getChatAccessToken } from '../auth/chatAccessToken';
import { resolveGsyenApiBase } from '../auth/gsyenApiProxy';

const API_BASE = resolveGsyenApiBase(import.meta.env.VITE_GSYEN_API_URL as string | undefined);

type PredictionResponse = {
  '专家': unknown;
  answer: unknown;
};

/**
 * Ask the local 老陈 prediction expert.
 * Returns an answer string if the expert matched, otherwise null
 * (caller should fall through to the general AI gateway).
 */
export async function askPredictionExpert(text: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const accessToken = await getChatAccessToken();
    if (!accessToken) return null;
    const res = await fetch(`${API_BASE}/api/model/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ q: text }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as PredictionResponse;
    const expert = typeof data['专家'] === 'string' ? data['专家'].trim() : '';
    const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
    return expert && expert !== '无' && answer ? answer : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Model service unavailable — silently fall through to the general gateway.
    return null;
  }
}
