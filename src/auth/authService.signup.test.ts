import { afterEach, describe, expect, it, vi } from 'vitest';

const { setSession, signup } = vi.hoisted(() => ({
  setSession: vi.fn(),
  signup: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: { setSession },
    rpc: vi.fn(),
  },
}));
vi.mock('./gsyenApiProxy', () => ({
  authProxy: {
    signup,
    login: vi.fn(),
    logout: vi.fn(),
    saveSession: vi.fn(),
  },
}));

import { signUpWithEmail } from './authService';

afterEach(() => {
  setSession.mockReset();
  signup.mockReset();
});

describe('email signup proxy integration', () => {
  it('passes the email-derived mailbox username to the signup proxy', async () => {
    signup.mockResolvedValue({
      ok: true,
      user: { id: 'user-id' },
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      mailboxAddress: 'ethan.7586@gsyen.com',
    });
    setSession.mockResolvedValue({
      data: {
        user: { id: 'user-id' },
        session: { access_token: 'access-token' },
      },
      error: null,
    });

    await expect(signUpWithEmail(' Ethan.7586+news@example.com ', 'password123')).resolves.toMatchObject({
      success: true,
      mailboxAddress: 'ethan.7586@gsyen.com',
    });
    expect(signup).toHaveBeenCalledWith(
      ' Ethan.7586+news@example.com ',
      'password123',
      'ethan.7586',
    );
  });

  it('preserves mailbox address when signup waits for verification', async () => {
    signup.mockResolvedValue({
      ok: true,
      user: { id: 'pending-user' },
      needsVerification: true,
      mailboxAddress: 'pending@gsyen.com',
    });

    await expect(signUpWithEmail('pending@example.com', 'password123')).resolves.toMatchObject({
      success: true,
      session: null,
      mailboxAddress: 'pending@gsyen.com',
    });
    expect(setSession).not.toHaveBeenCalled();
  });
});
