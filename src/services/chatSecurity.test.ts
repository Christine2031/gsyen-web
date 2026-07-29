// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getChatAccessToken, probeLocalChatGptBridge } = vi.hoisted(() => ({
  getChatAccessToken: vi.fn(),
  probeLocalChatGptBridge: vi.fn(),
}));

vi.mock('../auth/chatAccessToken', () => ({
  getChatAccessToken,
}));

vi.mock('./localBridge', () => ({
  probeLocalChatGptBridge,
}));

import { ChatGptBridgeUnavailableError, sendToGateway } from './chatService';

const okResponse = () => ({
  ok: true,
  headers: new Headers({ 'content-type': 'text/event-stream' }),
});

beforeEach(() => {
  getChatAccessToken.mockReset();
  probeLocalChatGptBridge.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  });
  (window as any).electronAPI = {
    localBridge: {
      getConfig: vi.fn(async () => ({
        base: 'http://127.0.0.1:43123',
        token: 'bridge-secret',
      })),
    },
  };
});

afterEach(() => {
  delete (window as any).electronAPI;
  vi.unstubAllGlobals();
});

describe('chat gateway authorization', () => {
  it('sends the Supabase access token to hosted model routes', async () => {
    getChatAccessToken.mockResolvedValue('user-token');

    await sendToGateway('kimi', []);

    expect(fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
    }));
  });

  it('sends the process-local bridge token to ChatGPT routes', async () => {
    probeLocalChatGptBridge.mockResolvedValue({
      base: 'http://127.0.0.1:43123',
      headers: { 'X-GSYEN-Bridge-Token': 'bridge-secret' },
      health: { status: 'online', authMode: 'chatgpt' },
    });

    await sendToGateway('chatgpt-pro', []);

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43123/api/chat',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-GSYEN-Bridge-Token': 'bridge-secret' }),
      }),
    );
    expect(getChatAccessToken).not.toHaveBeenCalled();
  });

  it('does not fall back to a cloud bearer for a local ChatGPT bridge', async () => {
    (window as any).electronAPI = undefined;
    probeLocalChatGptBridge.mockResolvedValue(null);

    await expect(sendToGateway('chatgpt-pro', [])).rejects.toBeInstanceOf(
      ChatGptBridgeUnavailableError,
    );
    expect(getChatAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
