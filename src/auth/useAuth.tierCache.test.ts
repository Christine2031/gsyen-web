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

import { resolveCachedTier } from './useAuth';

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
});
