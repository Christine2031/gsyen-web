import { useState, useEffect, useCallback } from 'react';
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

// ── Tier cache ────────────────────────────────────────────────────────────────
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

// ── Singleton store ───────────────────────────────────────────────────────────
// 所有 useAuth() 调用共享同一份状态，boot/listener 只初始化一次。
interface AuthStore extends AuthState { justVerified: boolean; }

let _store: AuthStore = { ...DEFAULT_AUTH_STATE, justVerified: false };
let _initialized = false;
let _currentUid: string | null = null;
const _listeners = new Set<(s: AuthStore) => void>();

// 读取页面加载时的 hash（魔法链接），模块初始化即捕获，防止后续被清除后读不到
const _magicLinkOnLoad =
  typeof window !== 'undefined' &&
  (window.location.hash.includes('type=magiclink') || window.location.hash.includes('type=email'));
let _magicLinkHandled = false;

function _set(patch: Partial<AuthStore>) {
  _store = { ..._store, ...patch };
  _listeners.forEach(fn => fn(_store));
}

// ── Auth state listener（全局注册一次）────────────────────────────────────────
function _initListener() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;

    if (_event === 'SIGNED_OUT' || !user) {
      if (_currentUid) clearTier(_currentUid);
      _currentUid = null;
      _set({ ...DEFAULT_AUTH_STATE, loading: false, justVerified: false });
      return;
    }

    const prevUid = _currentUid;
    _currentUid = user.id;

    if (session?.refresh_token) authProxy.saveSession(session.refresh_token).catch(() => {});

    // TOKEN_REFRESHED：同一用户只更新 session/user，不重置 tier/emailVerified（防闪烁）
    if (_event === 'TOKEN_REFRESHED' && prevUid === user.id) {
      _set({ user, session, loginProvider: (user.user_metadata?.provider ?? null) as LoginProvider | null });
      return;
    }

    const cached = readTier(user.id);
    _set({
      user, session,
      tier: cached?.tier ?? null,
      emailVerified: cached?.ev ?? false,
      loginProvider: (user.user_metadata?.provider ?? null) as LoginProvider | null,
      loading: false,
      isPasswordRecovery: _event === 'PASSWORD_RECOVERY',
    });

    // 魔法链接验证：升级 tier
    if (_magicLinkOnLoad && !_magicLinkHandled) {
      _magicLinkHandled = true;
      window.history.replaceState(null, '', window.location.pathname);
      upgradeTierToFree(user.id)
        .then(() => {
          writeTier(user.id, 'free');
          if (_store.user?.id === user.id) _set({ tier: 'free', emailVerified: true, justVerified: true });
        })
        .catch(() => {});
      return;
    }

    if (!cached || _event === 'SIGNED_IN') {
      initializeUserData(user.id, user.user_metadata?.provider ?? 'email')
        .then(tier => {
          if (tier) writeTier(user.id, tier);
          if (_store.user?.id === user.id)
            _set({ tier, emailVerified: tier !== 'free_unverified' && tier !== null });
        });
    }
  });
}

// ── Boot（全局执行一次）───────────────────────────────────────────────────────
function _boot() {
  if (_initialized) return;
  _initialized = true;

  if (!supabase) { _set({ loading: false }); return; }

  _initListener();

  (async () => {
    try {
      // Step 1: 本地 Supabase session（无网络，< 50ms）
      const { data: { session: local } } = await supabase.auth.getSession();

      if (local?.user && local.access_token) {
        const cached = readTier(local.user.id);
        _currentUid = local.user.id;
        _set({
          user: local.user, session: local,
          tier: cached?.tier ?? null,
          emailVerified: cached?.ev ?? false,
          loading: false,
        });
        initializeUserData(local.user.id, local.user.user_metadata?.provider ?? 'email')
          .then(tier => {
            if (tier) writeTier(local.user.id, tier);
            if (_store.user?.id === local.user.id)
              _set({ tier, emailVerified: tier !== 'free_unverified' && tier !== null });
          }).catch(() => {});
        if (local.refresh_token) authProxy.saveSession(local.refresh_token).catch(() => {});
        return;
      }

      // Step 2: 无本地 session → 尝试 HttpOnly cookie（仅此一次，不再 ×N）
      const me = await authProxy.me();
      if (_currentUid) return; // 等待期间已手动登录
      if (me.ok) {
        await supabase.auth.setSession({ access_token: me.access_token!, refresh_token: me.refresh_token! });
        return; // onAuthStateChange 接管
      }

      _set({ loading: false });
    } catch {
      _set({ loading: false });
    }
  })();
}

// ── useAuth hook（纯订阅者，不再含任何 init 逻辑）────────────────────────────
export function useAuth() {
  const [store, setStore] = useState<AuthStore>(_store);

  useEffect(() => {
    _listeners.add(setStore);
    _boot(); // 幂等：仅首次调用时真正执行
    return () => { _listeners.delete(setStore); };
  }, []);

  return {
    ...store,
    clearJustVerified:     useCallback(() => _set({ justVerified: false }), []),
    clearPasswordRecovery: useCallback(() => _set({ isPasswordRecovery: false }), []),
    signInWithEmail:       useCallback((e: string, p: string) => signInWithEmail(e, p), []),
    signUpWithEmail:       useCallback((e: string, p: string) => signUpWithEmail(e, p), []),
    signInWithOAuth:       useCallback((p: OAuthProvider)     => signInWithOAuth(p), []),
    signOut:               useCallback(()                      => signOut(), []),
    resetPasswordForEmail: useCallback((e: string)            => resetPasswordForEmail(e), []),
  };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
