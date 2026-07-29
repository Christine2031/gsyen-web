import { supabase } from './supabaseClient';
import { authProxy } from './gsyenApiProxy';
import { formatAuthError } from './authUtils';
import type { UserTier, OAuthProvider, AuthResult } from '../types/auth';

const USER_TIERS = new Set<UserTier>([
  'free_unverified',
  'free',
  'pro_month',
  'pro_year',
  'enterprise',
  'admin',
  'owner',
]);

export interface ResolvedMembership {
  tier: UserTier;
  emailVerified: boolean;
}

function resolvedMembership(data: unknown): ResolvedMembership | null {
  const row = (Array.isArray(data) ? data[0] : data) as {
    tier?: unknown;
    email_verified?: unknown;
  } | null;
  if (
    typeof row?.tier !== 'string'
    || !USER_TIERS.has(row.tier as UserTier)
    || typeof row.email_verified !== 'boolean'
  ) return null;

  return {
    tier: row.tier as UserTier,
    emailVerified: row.email_verified,
  };
}

async function resolveMyTier(): Promise<ResolvedMembership | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc('gsyen_resolve_my_tier');
    if (error) {
      console.warn(`[Auth] Failed to resolve membership (${error.code}):`, error.message);
      return null;
    }

    const membership = resolvedMembership(data);
    if (!membership) console.warn('[Auth] Membership resolver returned invalid data');
    return membership;
  } catch (err) {
    console.error('[Auth] Exception while resolving membership:', err);
    return null;
  }
}

/**
 * Resolve the authenticated user's server-owned membership.
 * Parameters remain for call-site compatibility; identity/provider are derived
 * from the authenticated Supabase session inside the database.
 */
export async function initializeUserData(
  _userId: string,
  _provider: string = 'email',
): Promise<ResolvedMembership | null> {
  return resolveMyTier();
}

/**
 * 邮箱 + 密码登录（通过 gsyen-api 代理，refresh_token 存入 HttpOnly cookie）
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, error: { message: 'Supabase not initialized' } };
  }

  console.log(`[Auth] Signing in with email: ${email}`);

  const result = await authProxy.login(email, password);
  if (!result.ok) {
    return { success: false, error: { message: result.error ?? 'login failed' } };
  }

  // Sync the in-memory Supabase client session so onAuthStateChange fires
  const { data, error } = await supabase.auth.setSession({
    access_token: result.access_token!,
    refresh_token: result.refresh_token ?? '',
  });

  if (error) {
    return { success: false, error: formatAuthError(error, 'setSession') };
  }

  return { success: true, user: data.user, session: data.session };
}

/**
 * 邮箱 + 密码注册（通过 gsyen-api 代理）
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, error: { message: 'Supabase not initialized' } };
  }

  console.log(`[Auth] Signing up with email: ${email}`);

  const result = await authProxy.signup(email, password);
  if (!result.ok) {
    return { success: false, error: { message: result.error ?? 'signup failed' } };
  }

  // If email verification is required, no session yet
  if (result.needsVerification || !result.access_token) {
    return { success: true, user: result.user, session: null };
  }

  // Sync the Supabase client with the session returned by the signup proxy
  const { data, error } = await supabase.auth.setSession({
    access_token: result.access_token!,
    refresh_token: result.refresh_token ?? '',
  });
  if (error) {
    return { success: false, error: formatAuthError(error, 'setSession') };
  }

  return { success: true, user: data.user, session: data.session };
}

/**
 * OAuth 登录（Google、GitHub 等）
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, error: { message: 'Supabase not initialized' } };
  }

  try {
    console.log(`[Auth] Signing in with ${provider}`);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });

    if (error) {
      return {
        success: false,
        error: formatAuthError(error, `signInWithOAuth(${provider})`),
      };
    }

    return { success: true };
  } catch (err) {
    console.error(`[Auth] Exception in signInWithOAuth(${provider}):`, err);
    return {
      success: false,
      error: { message: `使用 ${provider} 登录失败` },
    };
  }
}

/**
 * 发送密码重置邮件
 */
export async function resetPasswordForEmail(email: string): Promise<AuthResult> {
  if (!supabase) return { success: false, error: { message: 'Supabase not initialized' } };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    if (error) return { success: false, error: formatAuthError(error, 'resetPasswordForEmail') };
    return { success: true };
  } catch (err) {
    return { success: false, error: { message: '发送失败，请检查网络连接' } };
  }
}

/**
 * 邮箱验证后升级 tier：free_unverified → free
 */
export async function upgradeTierToFree(_userId: string): Promise<ResolvedMembership | null> {
  return resolveMyTier();
}

/**
 * 登出（清除 gsyen-api HttpOnly cookie + 本地 Supabase session）
 */
export async function signOut(): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, error: { message: 'Supabase not initialized' } };
  }

  console.log('[Auth] Signing out');

  // Clear HttpOnly cookie on gsyen-api first
  await authProxy.logout();

  // Clear in-memory Supabase session
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { success: false, error: formatAuthError(error, 'signOut') };
  }

  return { success: true };
}
