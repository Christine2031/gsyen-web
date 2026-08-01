import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_UPSTREAM = 'https://gsyen-api-776196228503.asia-east1.run.app';
const ALLOWED_AUTH_PATHS = new Set([
  '/api/auth/deactivate',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/session',
  '/api/auth/signup',
]);

function upstreamBase(): string {
  return (process.env.GSYEN_API_ORIGIN || DEFAULT_UPSTREAM).replace(/\/+$/, '');
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

function authPath(req: VercelRequest): string | null {
  const raw = req.query.path;
  const parts = Array.isArray(raw) ? raw : [raw].filter(Boolean);
  const queryPath = `/api/auth/${parts.join('/')}`.replace(/\/+$/, '');
  const requestPath = req.url
    ? new URL(req.url, 'https://gsyen.com').pathname.replace(/\/+$/, '')
    : '';
  const path = queryPath === '/api/auth' ? requestPath : queryPath;
  return ALLOWED_AUTH_PATHS.has(path) ? path : null;
}

function requestBody(req: VercelRequest): BodyInit | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body;
  return req.body === undefined ? undefined : JSON.stringify(req.body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = authPath(req);
  if (!path) return res.status(404).json({ error: 'auth_route_not_found' });

  const headers: Record<string, string> = {};
  for (const key of ['content-type', 'cookie', 'origin', 'user-agent']) {
    const value = headerValue(req.headers[key]);
    if (value) headers[key] = value;
  }
  const forwardedFor = headerValue(req.headers['x-forwarded-for']) ?? req.socket.remoteAddress;
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;

  try {
    const upstream = await fetch(`${upstreamBase()}${path}`, {
      method: req.method,
      headers,
      body: requestBody(req),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('cache-control', cacheControl);
    const setCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
    const fallbackCookie = upstream.headers.get('set-cookie');
    if (setCookies?.length) res.setHeader('set-cookie', setCookies);
    else if (fallbackCookie) res.setHeader('set-cookie', fallbackCookie);
    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return res.status(502).json({ error: 'auth_upstream_unavailable' });
  }
}
