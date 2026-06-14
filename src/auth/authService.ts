import { supabase } from './supabaseClient';
import { authProxy } from './gsyenApiProxy';
import { formatAuthError } from './authUtils';
import type { UserTier, OAuthProvider, AuthResult } from '../types/auth';

/**
 * 初始化用户数据（tier、login_provider）
 * 前期：不需要邮箱验证，直接进入
 * 后期：可扩展为邮箱验证、企业 SSO 等
 */
export async function initializeUserData(userId: string, provider: string = 'email'): Promise<UserTier | null> {
  if (!supabase) return null;

  try {
    // 1. 尝试查询现有 tier 记录
    const { data: existingTier, error: selectError } = await supabase
      .from('gsyen_user_tiers')
      .select('tier, login_provider')
      .eq('user_id', userId)
      .single();

    if (existingTier) {
      return (existingTier.tier as UserTier) ?? 'free_unverified';
    }

    // 2. 如果是 "not found" 错误，创建新记录
    if (selectError?.code === 'PGRST116') {
      console.log(`[Auth] Creating new user tier record for ${userId}`);

      const { data: newTier, error: insertError } = await supabase
        .from('gsyen_user_tiers')
        .insert({
          user_id: userId,
          tier: 'free_unverified',
          login_provider: provider,
          created_at: new Date().toISOString(),
        })
        .select('tier')
        .single();

      if (insertError) {
        console.error('[Auth] Failed to create user tier:', insertError.message);
        return 'free_unverified';
      }

      return (newTier?.tier as UserTier) ?? 'free_unverified';
    }

    // 3. 其他数据库错误（如 403 RLS 权限），降级处理
    if (selectError) {
      console.warn(`[Auth] Database error when fetching tier (${selectError.code}):`, selectError.message);
      return 'free_unverified'; // 降级：仍然允许进入
    }

    return 'free_unverified';
  } catch (err) {
    console.error('[Auth] Exception in initializeUserData:', err);
    return 'free_unverified'; // 降级：网络错误等也允许进入
  }
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

  // Auto-confirmed (dev env) — sync the Supabase client
  const { data, error } = await supabase.auth.setSession({
    access_token: result.access_token!,
    refresh_token: '',
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
export async function upgradeTierToFree(userId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from('gsyen_user_tiers')
      .update({ tier: 'free' })
      .eq('user_id', userId)
      .eq('tier', 'free_unverified');
    console.log(`[Auth] Upgraded tier to free for ${userId}`);
  } catch (err) {
    console.error('[Auth] Failed to upgrade tier to free:', err);
  }
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
