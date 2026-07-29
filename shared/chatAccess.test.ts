import { describe, expect, it, vi } from 'vitest';
import { enforceChatAccess, verifyChatIdentity } from './chatAccess';

const env = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
};

describe('enforceChatAccess', () => {
  it('verifies identity without consuming quota for bridge health checks', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }));

    const result = await verifyChatIdentity(
      new Headers({ Authorization: 'Bearer access-token' }),
      { env, fetcher },
    );

    expect(result).toEqual({ ok: true, userId: 'user-1' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts the standard authorization scheme case-insensitively', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }));

    const result = await verifyChatIdentity(
      new Headers({ Authorization: 'bearer access-token' }),
      { env, fetcher },
    );

    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });

  it('rejects anonymous requests before any upstream call', async () => {
    const fetcher = vi.fn();
    const result = await enforceChatAccess(new Headers(), { env, fetcher });

    expect(result).toMatchObject({ ok: false, status: 401, code: 'AUTH_REQUIRED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('authenticates the user and atomically consumes quota', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        allowed: true,
        tier: 'free',
        minute_remaining: 4,
        daily_remaining: 49,
      }), { status: 200 }));

    const result = await enforceChatAccess(
      new Headers({ Authorization: 'Bearer access-token' }),
      { env, fetcher },
    );

    expect(result).toMatchObject({
      ok: true,
      userId: 'user-1',
      tier: 'free',
      minuteRemaining: 4,
      dailyRemaining: 49,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns 429 without reaching a model when quota is exhausted', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        allowed: false,
        tier: 'free_unverified',
        quota_scope: 'minute',
        retry_after_seconds: 31,
        minute_remaining: 0,
        daily_remaining: 10,
      }), { status: 200 }));

    const result = await enforceChatAccess(
      new Headers({ Authorization: 'Bearer access-token' }),
      { env, fetcher },
    );

    expect(result).toMatchObject({
      ok: false,
      status: 429,
      code: 'CHAT_RATE_LIMITED',
      retryAfterSeconds: 31,
    });
  });

  it('fails closed when the quota RPC is unavailable', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('missing migration', { status: 404 }));

    const result = await enforceChatAccess(
      new Headers({ Authorization: 'Bearer access-token' }),
      { env, fetcher },
    );

    expect(result).toMatchObject({ ok: false, status: 503, code: 'CHAT_AUTH_UNAVAILABLE' });
  });

  it('rejects an unrecognized membership tier', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ allowed: true, tier: 'self_granted' }), { status: 200 }));

    const result = await enforceChatAccess(
      new Headers({ Authorization: 'Bearer access-token' }),
      { env, fetcher },
    );

    expect(result).toMatchObject({ ok: false, status: 403, code: 'CHAT_ACCESS_DENIED' });
  });
});
