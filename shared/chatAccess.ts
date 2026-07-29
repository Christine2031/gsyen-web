export type ChatTier =
  | 'free_unverified'
  | 'free'
  | 'pro_month'
  | 'pro_year'
  | 'enterprise'
  | 'admin'
  | 'owner';

type ChatAccessEnv = Record<string, string | undefined>;
type Fetcher = typeof fetch;

interface ChatAccessDeps {
  env?: ChatAccessEnv;
  fetcher?: Fetcher;
}

interface ChatAccessAllowed {
  ok: true;
  userId: string;
  tier: ChatTier;
  minuteRemaining: number;
  dailyRemaining: number;
}

export interface ChatAccessDenied {
  ok: false;
  status: 401 | 403 | 429 | 503;
  code: 'AUTH_REQUIRED' | 'CHAT_ACCESS_DENIED' | 'CHAT_RATE_LIMITED' | 'CHAT_AUTH_UNAVAILABLE';
  message: string;
  retryAfterSeconds?: number;
}

export type ChatAccessResult = ChatAccessAllowed | ChatAccessDenied;
export type ChatIdentityResult =
  | { ok: true; userId: string }
  | ChatAccessDenied;

export interface AuthenticatedChatIdentity {
  ok: true;
  userId: string;
  url: string;
  authHeaders: { apikey: string; Authorization: string };
  fetcher: Fetcher;
}

const VALID_TIERS = new Set<ChatTier>([
  'free_unverified', 'free', 'pro_month', 'pro_year', 'enterprise', 'admin', 'owner',
]);

function runtimeEnv(): ChatAccessEnv {
  return typeof process !== 'undefined' ? process.env : {};
}

function supabaseConfig(env: ChatAccessEnv) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
  };
}

function bearerToken(headers: Headers): string {
  const value = headers.get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  return match?.[1] && match[1].length <= 8192 ? match[1] : '';
}

function denied(
  status: ChatAccessDenied['status'],
  code: ChatAccessDenied['code'],
  message: string,
  retryAfterSeconds?: number,
): ChatAccessDenied {
  return { ok: false, status, code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
}

async function resolveChatIdentity(
  headers: Headers,
  deps: ChatAccessDeps = {},
): Promise<AuthenticatedChatIdentity | ChatAccessDenied> {
  const token = bearerToken(headers);
  if (!token) return denied(401, 'AUTH_REQUIRED', 'Sign in before using AI chat.');

  const { url, anonKey } = supabaseConfig(deps.env ?? runtimeEnv());
  if (!url || !anonKey) {
    return denied(503, 'CHAT_AUTH_UNAVAILABLE', 'Chat authorization is not configured.');
  }

  const fetcher = deps.fetcher ?? fetch;
  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${token}` };

  try {
    const userResponse = await fetcher(`${url}/auth/v1/user`, { headers: authHeaders });
    if (!userResponse.ok) return denied(401, 'AUTH_REQUIRED', 'Your session is invalid or expired.');
    const user = await userResponse.json() as { id?: string };
    if (!user.id) return denied(401, 'AUTH_REQUIRED', 'Your session is invalid or expired.');
    return { ok: true, userId: user.id, url, authHeaders, fetcher };
  } catch {
    return denied(503, 'CHAT_AUTH_UNAVAILABLE', 'Chat authorization is temporarily unavailable.');
  }
}

export async function verifyChatIdentity(
  headers: Headers,
  deps: ChatAccessDeps = {},
): Promise<ChatIdentityResult> {
  const identity = await resolveChatIdentity(headers, deps);
  return identity.ok ? { ok: true, userId: identity.userId } : identity;
}

export function authenticateChatAccess(
  headers: Headers,
  deps: ChatAccessDeps = {},
): Promise<AuthenticatedChatIdentity | ChatAccessDenied> {
  return resolveChatIdentity(headers, deps);
}

export async function consumeChatQuota(
  identity: AuthenticatedChatIdentity,
): Promise<ChatAccessResult> {
  try {
    const quotaResponse = await identity.fetcher(`${identity.url}/rest/v1/rpc/gsyen_consume_chat_quota`, {
      method: 'POST',
      headers: { ...identity.authHeaders, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!quotaResponse.ok) {
      return denied(503, 'CHAT_AUTH_UNAVAILABLE', 'Chat quota service is temporarily unavailable.');
    }

    const payload = await quotaResponse.json();
    const quota = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | undefined;
    const tier = quota?.tier;
    if (typeof tier !== 'string' || !VALID_TIERS.has(tier as ChatTier)) {
      return denied(403, 'CHAT_ACCESS_DENIED', 'Your membership does not permit AI chat.');
    }

    if (quota?.allowed !== true) {
      const retry = Number(quota?.retry_after_seconds) || 60;
      return denied(429, 'CHAT_RATE_LIMITED', 'Chat quota exceeded. Please try again later.', retry);
    }

    return {
      ok: true,
      userId: identity.userId,
      tier: tier as ChatTier,
      minuteRemaining: Math.max(0, Number(quota.minute_remaining) || 0),
      dailyRemaining: Math.max(0, Number(quota.daily_remaining) || 0),
    };
  } catch {
    return denied(503, 'CHAT_AUTH_UNAVAILABLE', 'Chat authorization is temporarily unavailable.');
  }
}

export async function enforceChatAccess(
  headers: Headers,
  deps: ChatAccessDeps = {},
): Promise<ChatAccessResult> {
  const identity = await authenticateChatAccess(headers, deps);
  if (identity.ok === false) return identity;
  return consumeChatQuota(identity);
}

export function chatAccessHeaders(result: ChatAccessResult): Record<string, string> {
  if (result.ok === false) {
    return result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : {};
  }
  return {
    'X-Chat-Tier': result.tier,
    'X-RateLimit-Minute-Remaining': String(result.minuteRemaining),
    'X-RateLimit-Daily-Remaining': String(result.dailyRemaining),
  };
}
