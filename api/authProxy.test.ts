import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './auth/[...path]';

function createRes() {
  const headers = new Map<string, unknown>();
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    setHeader(key: string, value: unknown) { headers.set(key.toLowerCase(), value); },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    send(value: unknown) { this.body = value; return this; },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('same-origin auth proxy', () => {
  it('forwards allowed auth routes and preserves set-cookie', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'gsyen_rt=next; Path=/; HttpOnly; Secure; SameSite=None',
        },
      }),
    );
    const res = createRes();

    await handler({
      method: 'GET',
      query: { path: ['me'] },
      headers: { cookie: 'gsyen_rt=old', origin: 'https://gsyen.com' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never, res as never);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gsyen-api-776196228503.asia-east1.run.app/api/auth/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ cookie: 'gsyen_rt=old' }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.headers.get('set-cookie'))).toContain('gsyen_rt=next');
  });

  it('rejects non-auth proxy paths', async () => {
    const res = createRes();
    await handler({
      method: 'GET',
      query: { path: ['../chat'] },
      headers: {},
      socket: {},
    } as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'auth_route_not_found' });
  });
});