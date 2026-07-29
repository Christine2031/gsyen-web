// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { probeLocalChatGptBridge, startLocalChatGptBind } from './localBridge';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
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

describe('local bridge authorization', () => {
  it('adds the bridge token to health and bind requests', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: true }) } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    await probeLocalChatGptBridge(100, true);
    await startLocalChatGptBind(100);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:43123/api/codex/health',
      expect.objectContaining({
        headers: { 'X-GSYEN-Bridge-Token': 'bridge-secret' },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:43123/api/codex/login/start',
      expect.objectContaining({
        headers: { 'X-GSYEN-Bridge-Token': 'bridge-secret' },
      }),
    );
  });

  it('does not send a cloud bearer to an unproven browser localhost service', async () => {
    (window as any).electronAPI = undefined;
    const fetchMock = vi.mocked(fetch);

    const probe = await probeLocalChatGptBridge(100, true);

    expect(probe).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
