// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: null }));
vi.mock('./gsyenApiProxy', () => ({ authProxy: {} }));
vi.mock('./authService', () => ({
  initializeUserData: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  upgradeTierToFree: vi.fn(),
}));

import { resolveCachedTier, retryNull } from './useAuth';

describe('auth tier cache fallback', () => {
  it('uses explicit tier cache before the optimistic user snapshot', () => {
    expect(resolveCachedTier(
      { tier: 'owner', ev: true },
      { uid: 'u1', email: 'ethan@gsyen.com', tier: 'free', ev: true, provider: 'email' },
      'u1',
    )).toEqual({ tier: 'owner', ev: true });
  });

  it('keeps MEMBER from the user snapshot when tier cache is missing', () => {
    expect(resolveCachedTier(
      null,
      { uid: 'u1', email: 'ethan@gsyen.com', tier: 'free', ev: true, provider: 'email' },
      'u1',
    )).toEqual({ tier: 'free', ev: true });
  });

  it('does not reuse another account snapshot', () => {
    expect(resolveCachedTier(
      null,
      { uid: 'u2', email: 'other@gsyen.com', tier: 'free', ev: true, provider: 'email' },
      'u1',
    )).toBeNull();
  });

  it('does not invent a tier when the snapshot has no resolved membership', () => {
    expect(resolveCachedTier(
      null,
      { uid: 'u1', email: 'ethan@gsyen.com', tier: null, ev: true, provider: 'email' },
      'u1',
    )).toBeNull();
  });
});

describe('auth membership recovery', () => {
  it('retries a temporary null result and returns the real membership', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tier: 'owner', emailVerified: true });

    await expect(retryNull(load, [0, 0, 0])).resolves.toEqual({
      tier: 'owner', emailVerified: true,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stays fail-closed after the bounded retry budget is exhausted', async () => {
    const load = vi.fn().mockResolvedValue(null);

    await expect(retryNull(load, [0, 0, 0])).resolves.toBeNull();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not retry after the first successful membership response', async () => {
    const membership = { tier: 'free', emailVerified: true } as const;
    const load = vi.fn().mockResolvedValue(membership);

    await expect(retryNull(load, [0, 0, 0])).resolves.toEqual(membership);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
