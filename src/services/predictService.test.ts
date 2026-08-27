// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getChatAccessToken } = vi.hoisted(() => ({
  getChatAccessToken: vi.fn(),
}));

vi.mock('../auth/chatAccessToken', () => ({ getChatAccessToken }));

import { askPredictionExpert } from './predictService';

beforeEach(() => {
  getChatAccessToken.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prediction expert API boundary', () => {
  it('does not contact the model without an authenticated access token', async () => {
    getChatAccessToken.mockResolvedValue(null);
    await expect(askPredictionExpert('明天备多少货')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the same configured GSYEN API boundary with bearer authentication', async () => {
    getChatAccessToken.mockResolvedValue('user-token');
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      '专家': '备货预测',
      answer: '建议备货 10 斤',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(askPredictionExpert('明天备多少货')).resolves.toBe('建议备货 10 斤');
    expect(fetch).toHaveBeenCalledWith('/api/model/ask', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
      body: JSON.stringify({ q: '明天备多少货' }),
    }));
  });

  it('rejects malformed answers and preserves caller cancellation', async () => {
    getChatAccessToken.mockResolvedValue('user-token');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      '专家': '备货预测',
      answer: 42,
    }), { status: 200 }));
    await expect(askPredictionExpert('明天备多少货')).resolves.toBeNull();

    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(askPredictionExpert('明天备多少货', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
