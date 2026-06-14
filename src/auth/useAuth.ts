import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { authProxy } from './gsyenApiProxy';
import {
  initializeUserData, resetPasswordForEmail,
  signInWithEmail, signUpWithEmail, signInWithOAuth,
  signOut, upgradeTierToFree,
} from './authService';
import type { AuthState, OAuthProvider, UserTier, LoginProvider } from '../types/auth';

const DEFAULT_AUTH_STATE: AuthState = {
  user: null, session: null, tier: null,
  emailVerified: false, loginProvider: null,
  loading: true, isPasswordRecovery: false,
};

// ── Tier cache ──────────────────────────────────────────────────────────────
// localStorage keyed by userId，消除 TOKEN_REFRESHED 触发的 0.5s "未验证" 闪烁。
// 写入：SIGNED_IN / 验证成功 / 后台刷新后
// 清除：SIGNED_OUT
interface TierCache { tier: UserTier; ev: boolean; }
const TIER_KEY = (uid: string) => `gsyen_tier_${uid}`;

function readTier(uid: string): TierCache | null {
  try { const r = localStorage.getItem(TIER_KEY(uid)); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function writeTier(uid: string, tier: UserTier) {
  try {
    localStorage.setItem(TIER_KEY(uid), JSON.stringify({
      tier, ev: tier !== 'free_unverified' && tier !== null,
    }));
  } catch {}
}
function clearTier(uid: string) {
  try { localStorage.removeItem(TIER_KEY(uid)); } catch {}
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(DEFAULT_AUTH_STATE);
  const [justVerified, setJustVerified] = useState(false);

  const magicLinkRef = useRef(
    typeof window !== 'undefined' &&
    (window.location.hash.includes('type=magiclink') || window.location.hash.includes('type=email'))
  );
  // 跟踪当前 userId，用于 SIGNED_OUT 时精准清除 cache
  const currentUidRef = useRef<string | null>(null);

  // Effect 1: Boot — 三段式，按速度从快到慢
  useEffect(() => {
    if (!supabase) { setState(s => ({ ...s, loading: false })); return; }
    let cancelled = false;

    (async () => {
      try {
        // Step 1: 本地 session（Supabase SDK 缓存，无需网络，< 50ms）
        const { data: { session: local } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (local?.user && local.access_token) {
          // 立即用 localStorage 里的 tier 显示 UI，0 等待
          const cached = readTier(local.user.id);
          currentUidRef.current = local.user.id;
          setState(s => ({
            ...s, user: local.user, session: local,
            tier: cached?.tier ?? null,
            emailVerified: cached?.ev ?? false,
            loading: false,
          }));
          // 后台静默刷新 tier（stale-while-revalidate）
          initializeUserData(local.user.id, local.user.user_metadata?.provider ?? 'email')
            .then(tier => {
              if (tier) writeTier(local.user.id, tier);
              if (!cancelled) setState(s => s.user?.id === local.user.id
                ? { ...s, tier, emailVerified: tier !== 'free_unverified' && tier !== null }
                : s);
            }).catch(() => {});
          if (local.refresh_token) authProxy.saveSession(local.refresh_token).catch(() => {});
          return;
        }

        // Step 2: 无本地 session → 尝试 HttpOnly cookie（Cloud Run，可能冷启动）
        const me = await authProxy.me();
        // 等待期间用户已手动登录，不再干扰
        if (cancelled || currentUidRef.current) return;
        if (me.ok) {
          await supabase.auth.setSession({ access_token: me.access_token!, refresh_token: me.refresh_token! });
          return; // onAuthStateChange 接管
        }

        if (!cancelled) setState(s => ({ ...s, loading: false }));
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Effect 2: 监听所有 auth 事件
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      // SIGNED_OUT：清缓存 + 重置状态
      if (_event === 'SIGNED_OUT' || !user) {
        if (currentUidRef.current) clearTier(currentUidRef.current);
        currentUidRef.current = null;
        setState({ ...DEFAULT_AUTH_STATE, loading: false });
        return;
      }

      const prevUid = currentUidRef.current;
      currentUidRef.current = user.id;

      // 持久化 refresh_token 到 HttpOnly cookie
      if (session?.refresh_token) authProxy.saveSession(session.refresh_token).catch(() => {});

      // TOKEN_REFRESHED（同一用户）：只更新 session/user，tier/emailVerified 原地不动
      // 这是 0.5s 闪烁的根因修复点
      if (_event === 'TOKEN_REFRESHED' && prevUid === user.id) {
        setState(s => ({
          ...s, user, session,
          loginProvider: (user.user_metadata?.provider ?? null) as LoginProvider | null,
        }));
        return;
      }

      // SIGNED_IN / USER_UPDATED 等：先用缓存，后台刷新
      const cached = readTier(user.id);
      setState(s => ({
        ...s, user, session,
        tier: cached?.tier ?? null,
        emailVerified: cached?.ev ?? false,
        loginProvider: (user.user_metadata?.provider ?? null) as LoginProvider | null,
        loading: false,
        isPasswordRecovery: _event === 'PASSWORD_RECOVERY',
      }));

      // 魔法链接验证：升级 tier 并写缓存
      if (magicLinkRef.current) {
        magicLinkRef.current = false;
        window.history.replaceState(null, '', window.location.pathname);
        upgradeTierToFree(user.id)
          .then(() => {
            writeTier(user.id, 'free');
            setState(s => s.user?.id === user.id ? { ...s, tier: 'free', emailVerified: true } : s);
            setJustVerified(true);
          })
          .catch(() => {});
        return; // 已知 tier = free，无需再查 DB
      }

      // 无缓存 或 首次 SIGNED_IN：查 DB 并写缓存
      if (!cached || _event === 'SIGNED_IN') {
        initializeUserData(user.id, user.user_metadata?.provider ?? 'email')
          .then(tier => {
            if (tier) writeTier(user.id, tier);
            setState(s => s.user?.id === user.id
              ? { ...s, tier, emailVerified: tier !== 'free_unverified' && tier !== null }
              : s);
          });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    ...state,
    justVerified,
    clearJustVerified: useCallback(() => setJustVerified(false), []),
    signInWithEmail:     useCallback((e: string, p: string) => signInWithEmail(e, p), []),
    signUpWithEmail:     useCallback((e: string, p: string) => signUpWithEmail(e, p), []),
    signInWithOAuth:     useCallback((p: OAuthProvider)     => signInWithOAuth(p), []),
    signOut:             useCallback(()                      => signOut(), []),
    resetPasswordForEmail: useCallback((e: string)          => resetPasswordForEmail(e), []),
    clearPasswordRecovery: useCallback(() => setState(s => ({ ...s, isPasswordRecovery: false })), []),
  };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
