import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('./supabaseClient', () => ({
  supabase: { rpc },
}));
vi.mock('./gsyenApiProxy', () => ({
  authProxy: {},
}));

import { initializeUserData, upgradeTierToFree } from './authService';

afterEach(() => {
  rpc.mockReset();
});

describe('membership tier resolution', () => {
  it('uses the authenticated server resolver without accepting a user id', async () => {
    rpc.mockResolvedValue({
      data: [{ tier: 'free', email_verified: true }],
      error: null,
    });

    await expect(initializeUserData('client-supplied-id', 'google')).resolves.toEqual({
      tier: 'free',
      emailVerified: true,
    });
    expect(rpc).toHaveBeenCalledWith('gsyen_resolve_my_tier');
  });

  it('uses the same server-verified path for email verification upgrades', async () => {
    rpc.mockResolvedValue({
      data: [{ tier: 'free', email_verified: true }],
      error: null,
    });

    await expect(upgradeTierToFree('client-supplied-id')).resolves.toEqual({
      tier: 'free',
      emailVerified: true,
    });
    expect(rpc).toHaveBeenCalledWith('gsyen_resolve_my_tier');
  });

  it('does not turn database failures into a fabricated tier', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST301', message: 'authorization failed' },
    });

    await expect(initializeUserData('user-id')).resolves.toBeNull();
  });

  it('rejects unknown tier values returned by the database', async () => {
    rpc.mockResolvedValue({
      data: [{ tier: 'super_admin', email_verified: true }],
      error: null,
    });

    await expect(initializeUserData('user-id')).resolves.toBeNull();
  });
});
