import { afterEach, describe, expect, it, vi } from 'vitest';

const { getSession, setSession, me } = vi.hoisted(() => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  me: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession, setSession } },
}));
vi.mock('./gsyenApiProxy', () => ({
  authProxy: { me },
}));

import { getChatAccessToken } from './chatAccessToken';

afterEach(() => {
  getSession.mockReset();
  setSession.mockReset();
  me.mockReset();
});

describe('chat access token recovery', () => {
  it('uses a current in-memory access token without a proxy request', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'current-token', expires_at: Math.floor(Date.now() / 1000) + 3600 } },
    });

    await expect(getChatAccessToken()).resolves.toBe('current-token');
    expect(me).not.toHaveBeenCalled();
  });

  it('recovers an expired session through the HttpOnly auth cookie', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token', expires_at: 1 } },
    });
    me.mockResolvedValue({
      ok: true,
      access_token: 'restored-access',
      refresh_token: 'rotated-refresh',
    });
    setSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'restored-access',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });

    await expect(getChatAccessToken()).resolves.toBe('restored-access');
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'restored-access',
      refresh_token: 'rotated-refresh',
    });
  });

  it('fails closed when neither session source is available', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    me.mockResolvedValue({ ok: false, status: 401 });

    await expect(getChatAccessToken()).resolves.toBe('');
  });
});
