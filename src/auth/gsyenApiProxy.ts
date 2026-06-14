/**
 * gsyenApiProxy — thin fetch wrapper for the gsyen-api auth proxy.
 * All requests go with credentials: 'include' so the browser
 * sends the HttpOnly gsyen_rt cookie automatically.
 */
const BASE = (import.meta.env.VITE_GSYEN_API_URL as string | undefined) || 'http://localhost:3000';

export interface AuthProxyResult {
  ok: boolean;
  user?: any;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
  needsVerification?: boolean;
}

async function post(path: string, body?: object): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const authProxy = {
  async login(email: string, password: string): Promise<AuthProxyResult> {
    try {
      const r = await post('/api/auth/login', { email, password });
      const json = await r.json();
      if (!r.ok) return { ok: false, error: String(json.error ?? 'login failed') };
      return {
        ok: true,
        user: json.user,
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: json.expires_at,
      };
    } catch {
      return { ok: false, error: '网络错误，请检查连接' };
    }
  },

  async signup(email: string, password: string): Promise<AuthProxyResult> {
    try {
      const r = await post('/api/auth/signup', { email, password });
      const json = await r.json();
      if (!r.ok) return { ok: false, error: String(json.error ?? 'signup failed') };
      return {
        ok: true,
        user: json.user,
        access_token: json.access_token,
        needsVerification: !!json.needsVerification,
      };
    } catch {
      return { ok: false, error: '网络错误，请检查连接' };
    }
  },

  async logout(): Promise<void> {
    try { await post('/api/auth/logout'); } catch {}
  },

  async me(): Promise<AuthProxyResult> {
    try {
      const r = await fetch(`${BASE}/api/auth/me`, { credentials: 'include' });
      if (!r.ok) return { ok: false };
      const json = await r.json();
      return {
        ok: true,
        user: json.user,
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: json.expires_at,
      };
    } catch {
      return { ok: false };
    }
  },

  // Called after OAuth redirect to persist refresh_token in the HttpOnly cookie
  async saveSession(refresh_token: string): Promise<void> {
    try { await post('/api/auth/session', { refresh_token }); } catch {}
  },
};
