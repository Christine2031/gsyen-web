import type { VercelRequest, VercelResponse } from './vercelHttpTypes';

const ALLOWED_AUTH_PATHS = new Set([
  '/api/auth/deactivate',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/session',
  '/api/auth/signup',
]);

const REFRESH_COOKIE = 'gsyen_rt';
const REFRESH_COOKIE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=None; Max-Age=2592000';

type BodyLike = Record<string, unknown> | string | undefined;

const DEFAULT_API_ORIGIN = process.env.API_ORIGIN_FALLBACK ?? 'https://api.gsyen.com';

type SupabaseAuthResponse = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
};

function resolveServerGsyenApiOrigin(
  configured = process.env.GSYEN_API_ORIGIN ?? process.env.VITE_GSYEN_API_URL,
  requestHost?: string,
): string {
  const value = configured?.trim() || resolveApiOriginFromHost(requestHost);

  if (!value) {
    throw new Error('GSYEN_API_ORIGIN is required');
  }

  const url = new URL(value);
  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';

  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('GSYEN_API_ORIGIN must use HTTPS outside local development');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('GSYEN_API_ORIGIN must be an origin without credentials, query, or hash');
  }

  return url.origin;
}

function resolveApiOriginFromHost(hostHeader: string | undefined): string {
  const host = hostHeader?.split(':')[0]?.trim().toLowerCase();
  if (!host) return '';
  if (host === 'localhost' || host === '127.0.0.1') return DEFAULT_API_ORIGIN;
  if (host === 'gsyen.com' || host === 'www.gsyen.com' || host.endsWith('.gsyen.com')) return 'https://api.gsyen.com';
  return `https://${host}`;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

function clearCookieHeader(): string {
  return `${REFRESH_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function refreshCookieHeader(token: string | undefined): string {
  return `${REFRESH_COOKIE}=${token || ''}; ${REFRESH_COOKIE_ATTRS}`;
}

function getCookieValue(cookies: string | undefined, name: string): string | undefined {
  if (!cookies) return;
  const pref = `${name}=`;
  const pair = cookies
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(pref));
  if (!pair) return;
  return decodeURIComponent(pair.slice(pref.length));
}

function parseJsonBody(body: BodyLike): Record<string, unknown> | undefined {
  if (!body) return;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return;
    }
  }
  return typeof body === 'object' ? body : undefined;
}

function resolveSupabaseConfig() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anonKey) return;

  const url = new URL(base);
  if (url.protocol !== 'https:') return;

  return { base: url.origin, anonKey };
}

function stringifyMessage(data: Record<string, unknown>): string {
  const msg =
    String(data.error_description ?? data.error ?? data.message ?? 'auth unavailable');
  return msg;
}

async function supabaseAuthRequest(path: string, payload: Record<string, unknown>): Promise<SupabaseAuthResponse> {
  const config = resolveSupabaseConfig();
  if (!config) return { ok: false, status: 503, data: { error: 'auth fallback unavailable' } };

  const response = await fetch(`${config.base}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    data = { message: text || response.statusText };
  }
  return { ok: response.ok, status: response.status, data };
}

async function handleFallbackAuth(path: string, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (!resolveSupabaseConfig()) return false;

  try {
    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = parseJsonBody(req.body as BodyLike);
      const email = String(body?.email || '').trim().toLowerCase();
      const password = String(body?.password || '').trim();
      if (!email || !password) {
        return Boolean(res.status(400).json({ error: 'email and password required' }));
      }

      const response = await supabaseAuthRequest('/token?grant_type=password', {
        email,
        password,
      });
      const data = response.data;
      if (!response.ok) return Boolean(res.status(response.status).json({ error: stringifyMessage(data) }));

      if (typeof data.refresh_token === 'string') {
        res.setHeader('set-cookie', refreshCookieHeader(data.refresh_token));
      }
      return Boolean(res.status(200).json({
        user: data.user,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      }));
    }

    if (path === '/api/auth/me' && (req.method === 'GET' || req.method === 'POST')) {
      const body = parseJsonBody(req.body as BodyLike);
      const cookieHeader = headerValue(req.headers.cookie);
      const refreshToken = body?.refresh_token ? String(body.refresh_token) : getCookieValue(cookieHeader, REFRESH_COOKIE);
      if (!refreshToken) {
        return Boolean(res.status(401).json({ error: 'no session' }));
      }

      const response = await supabaseAuthRequest('/token?grant_type=refresh_token', {
        refresh_token: refreshToken,
      });
      const data = response.data;
      if (!response.ok) {
        res.setHeader('set-cookie', clearCookieHeader());
        return Boolean(res.status(response.status).json({ error: stringifyMessage(data) }));
      }
      if (typeof data.refresh_token === 'string') {
        res.setHeader('set-cookie', refreshCookieHeader(data.refresh_token));
      }
      return Boolean(res.status(200).json({
        user: data.user,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      }));
    }

    if (path === '/api/auth/session' && req.method === 'POST') {
      const body = parseJsonBody(req.body as BodyLike);
      const refreshToken = String(body?.refresh_token || '').trim();
      if (!refreshToken) {
        return Boolean(res.status(400).json({ error: 'refresh_token required' }));
      }
      res.setHeader('set-cookie', refreshCookieHeader(refreshToken));
      return Boolean(res.status(200).json({ ok: true }));
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      res.setHeader('set-cookie', clearCookieHeader());
      return Boolean(res.status(200).json({ ok: true }));
    }
  } catch {
    return false;
  }

  return false;
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
    const upstream = await fetch(`${resolveServerGsyenApiOrigin(undefined, headerValue(req.headers.host))}${path}`, {
      method: req.method,
      headers,
      body: requestBody(req),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok && upstream.status >= 500 && await handleFallbackAuth(path, req, res)) {
      return;
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('cache-control', cacheControl);
    const setCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
    const fallbackCookie = upstream.headers.get('set-cookie');
    if (setCookies?.length) res.setHeader('set-cookie', setCookies);
    else if (fallbackCookie) res.setHeader('set-cookie', fallbackCookie);
    return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    if (await handleFallbackAuth(path, req, res)) {
      return;
    }
    if (error instanceof Error && error.message === 'GSYEN_API_ORIGIN is required') {
      return res.status(503).json({ error: 'GSYEN_API_ORIGIN is not configured' });
    }
    return res.status(502).json({ error: 'auth_upstream_unavailable' });
  }
}
