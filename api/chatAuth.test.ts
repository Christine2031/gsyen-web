import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './chat';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function authorizeNextRequest(quota: Record<string, unknown>) {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(quota), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('POST /api/chat authorization boundary', () => {
  it('rejects an anonymous request before parsing or contacting a model', async () => {
    const request = new Request('https://gsyen.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], model: 'kimi' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await handler(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('keeps the existing authorized request and SSE response contract', async () => {
    const fetcher = authorizeNextRequest({
      allowed: true,
      tier: 'free',
      minute_remaining: 4,
      daily_remaining: 49,
    });
    const request = new Request('https://gsyen.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hello', attachments: [] }],
        model: 'kimi',
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-ratelimit-daily-remaining')).toBe('49');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized authorized input before contacting a model', async () => {
    const fetcher = authorizeNextRequest({
      allowed: true,
      tier: 'free',
      minute_remaining: 4,
      daily_remaining: 49,
    });
    const request = new Request('https://gsyen.com/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: Array.from({ length: 81 }, () => ({ role: 'user', content: 'hello' })),
        model: 'kimi',
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: 'CHAT_REQUEST_TOO_LARGE' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns 400 rather than leaking a parser failure for invalid JSON', async () => {
    authorizeNextRequest({
      allowed: true,
      tier: 'free',
      minute_remaining: 4,
      daily_remaining: 49,
    });
    const request = new Request('https://gsyen.com/api/chat', {
      method: 'POST',
      body: '{"messages":',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CHAT_REQUEST' });
  });
});
