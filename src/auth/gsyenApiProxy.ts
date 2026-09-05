/**
 * gsyenApiProxy — thin fetch wrapper for the gsyen-api auth proxy.
 * All requests go with credentials: 'include' so the browser
 * sends the HttpOnly gsyen_rt cookie automatically.
 */
import { supabase } from './supabaseClient';

export function resolveGsyenApiBase(
  configured?: string,
  protocol = typeof window !== 'undefined' ? window.location.protocol : '',
): string {
  // Browser auth must stay first-party so gsyen_rt belongs to gsyen.com.
  if (protocol !== 'file:') return '';
  const value = configured?.trim().replace(/\/+$/, '');
  if (!value) throw new Error('VITE_GSYEN_API_URL is required for packaged Electron');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_GSYEN_API_URL must be a clean HTTPS origin');
  }
  return url.origin;
}

const BASE = resolveGsyenApiBase(import.meta.env.VITE_GSYEN_API_URL as string | undefined);

function authEndpoint(path: string): string { return `${BASE}${path}`; }
const AUTH_ME_BACKOFF_KEY = 'gsyen_auth_me_backoff_until';
const AUTH_ME_BACKOFF_MS = 3 * 60 * 1000;

function getAuthMeBackoffUntil(): number {
  if (typeof localStorage === 'undefined') return 0;
  return Number(localStorage.getItem(AUTH_ME_BACKOFF_KEY) ?? '0');
}

function setAuthMeBackoff(until = Date.now() + AUTH_ME_BACKOFF_MS): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AUTH_ME_BACKOFF_KEY, String(until));
}

function clearAuthMeBackoff(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AUTH_ME_BACKOFF_KEY);
}

export interface AuthProxyResult {
  ok: boolean;
  status?: number;   // HTTP 状态码，0 = 网络错误
  user?: any;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
  needsVerification?: boolean;
  mailboxAddress?: string | null;
}

type AuthProxyJson = {
  error?: unknown;
  user?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  needsVerification?: unknown;
  mailboxAddress?: unknown;
};

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
      const json = await r.json() as AuthProxyJson;
      if (!r.ok) {
        return {
          ok: false,
          status: r.status,
          error: String(json.error ?? 'login failed'),
        };
      }
      return {
        ok: true,
        user: json.user,
        access_token: typeof json.access_token === 'string' ? json.access_token : undefined,
        refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expires_at: typeof json.expires_at === 'number' ? json.expires_at : undefined,
      };
    } catch {
      return { ok: false, status: 0, error: '网络错误，请检查连接' };
    }
  },

  async signup(email: string, password: string, username?: string): Promise<AuthProxyResult> {
    try {
      const r = await post('/api/auth/signup', { email, password, username });
      const json = await r.json() as AuthProxyJson;
      if (!r.ok) return {
        ok: false,
        status: r.status,
        error: String(json.error ?? 'signup failed'),
      };
      return {
        ok: true,
        user: json.user,
        access_token: typeof json.access_token === 'string' ? json.access_token : undefined,
        refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expires_at: typeof json.expires_at === 'number' ? json.expires_at : undefined,
        needsVerification: json.needsVerification === true,
        mailboxAddress: typeof json.mailboxAddress === 'string' ? json.mailboxAddress : null,
      };
    } catch {
      return { ok: false, status: 0, error: '网络错误，请检查连接' };
    }
  },

  async logout(): Promise<void> {
    try { await post('/api/auth/logout'); } catch {}
  },

  async me(): Promise<AuthProxyResult> {
    try {
      const { data: localSessionData } = await supabase.auth.getSession();
      if (localSessionData.session?.access_token) {
        clearAuthMeBackoff();
        return {
          ok: true,
          status: 200,
          user: localSessionData.session.user,
          access_token: localSessionData.session.access_token,
          refresh_token: localSessionData.session.refresh_token,
          expires_at: localSessionData.session.expires_at,
        };
      }
    } catch {}

    const skipUntil = getAuthMeBackoffUntil();
    if (Number.isFinite(skipUntil) && skipUntil > Date.now()) {
      return { ok: false, status: 0, error: 'auth_me_backoff' };
    }

    try {
      const r = await fetch(authEndpoint('/api/auth/me'), { credentials: 'include' });
      if (!r.ok) {
        if (r.status === 503 || r.status === 0) setAuthMeBackoff();
        else if (r.status === 401) clearAuthMeBackoff();
        return { ok: false, status: r.status };
      }

      clearAuthMeBackoff();
      const json = await r.json() as AuthProxyJson;
      return {
        ok: true, status: 200,
        user: json.user,
        access_token: typeof json.access_token === 'string' ? json.access_token : undefined,
        refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expires_at: typeof json.expires_at === 'number' ? json.expires_at : undefined,
      };
    } catch {
      setAuthMeBackoff();
      return { ok: false, status: 0 }; // 0 = 网络错误
    }
  },

  // Called after OAuth redirect to persist refresh_token in the HttpOnly cookie
  async saveSession(refresh_token: string): Promise<void> {
    try { await post('/api/auth/session', { refresh_token }); } catch {}
  },
};
