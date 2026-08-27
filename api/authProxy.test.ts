import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './auth/[...path]';

const originalOrigin = process.env.GSYEN_API_ORIGIN;

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

beforeEach(() => {
  process.env.GSYEN_API_ORIGIN = 'https://api-shadow.gsyen.example';
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalOrigin === undefined) delete process.env.GSYEN_API_ORIGIN;
  else process.env.GSYEN_API_ORIGIN = originalOrigin;
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
      url: '/api/auth/me', query: {},
      headers: { cookie: 'gsyen_rt=old', origin: 'https://gsyen.com' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never, res as never);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-shadow.gsyen.example/api/auth/me',
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

  it('fails closed when the upstream origin is not configured', async () => {
    delete process.env.GSYEN_API_ORIGIN;
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const res = createRes();
    await handler({
      method: 'GET',
      url: '/api/auth/me', query: {}, headers: {}, socket: {},
    } as never, res as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'auth_upstream_unavailable' });
  });
});
