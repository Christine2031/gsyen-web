import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyChatIdentity } = vi.hoisted(() => ({
  verifyChatIdentity: vi.fn(),
}));

vi.mock('../shared/chatAccess', () => ({ verifyChatIdentity }));

import {
  isValidLocalBridgeToken,
  requireLocalBridgeAccess,
  resolveChatAccessMode,
} from './localBridgeAuth';

function responseDouble() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  verifyChatIdentity.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('local bridge token', () => {
  it('fails closed when the server token is absent', () => {
    expect(isValidLocalBridgeToken('anything', undefined)).toBe(false);
  });

  it('accepts only the exact per-launch token', () => {
    expect(isValidLocalBridgeToken('correct-token', 'correct-token')).toBe(true);
    expect(isValidLocalBridgeToken('wrong-token', 'correct-token')).toBe(false);
  });

  it('uses one fail-closed policy for browser and Local Bridge chat routes', () => {
    expect(resolveChatAccessMode('kimi', undefined, 'correct-token')).toBe('cloud');
    expect(resolveChatAccessMode('chatgpt-pro', undefined, undefined)).toBe('cloud');
    expect(resolveChatAccessMode('chatgpt-pro', undefined, 'correct-token')).toBe('reject');
    expect(resolveChatAccessMode('chatgpt-pro', 'wrong-token', 'correct-token')).toBe('reject');
    expect(resolveChatAccessMode(
      'chatgpt-pro',
      'correct-token',
      'correct-token',
    )).toBe('local-bridge');
  });

  it('accepts the Electron launch token without a cloud identity lookup', async () => {
    vi.stubEnv('LOCAL_BRIDGE_TOKEN', 'correct-token');
    const res = responseDouble();

    await expect(requireLocalBridgeAccess({
      headers: { 'x-gsyen-bridge-token': 'correct-token' },
    }, res)).resolves.toBe(true);
    expect(verifyChatIdentity).not.toHaveBeenCalled();
  });

  it.each([undefined, 'wrong-token'])(
    'rejects %s when an Electron token is configured, even with valid cloud identity',
    async supplied => {
      vi.stubEnv('LOCAL_BRIDGE_TOKEN', 'correct-token');
      verifyChatIdentity.mockResolvedValue({ ok: true, userId: 'other-user' });
      const res = responseDouble();

      await expect(requireLocalBridgeAccess({
        headers: {
          ...(supplied ? { 'x-gsyen-bridge-token': supplied } : {}),
          authorization: 'Bearer access-token',
        },
      }, res)).resolves.toBe(false);
      expect(verifyChatIdentity).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'BRIDGE_AUTH_REQUIRED',
      }));
    },
  );

  it('accepts a valid signed-in browser user when no Electron token exists', async () => {
    verifyChatIdentity.mockResolvedValue({ ok: true, userId: 'user-1' });
    const res = responseDouble();

    await expect(requireLocalBridgeAccess({
      headers: { authorization: 'Bearer access-token' },
    }, res)).resolves.toBe(true);
    expect(verifyChatIdentity).toHaveBeenCalledOnce();
  });

  it('fails closed when neither local nor browser identity is valid', async () => {
    verifyChatIdentity.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Sign in before using AI chat.',
    });
    const res = responseDouble();

    await expect(requireLocalBridgeAccess({ headers: {} }, res)).resolves.toBe(false);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
  });
});
