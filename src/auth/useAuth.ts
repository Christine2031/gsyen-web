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

interface TierCache { tier: UserTier; ev: boolean; }
const TIER_KEY = (uid: string) => `gsyen_tier_${uid}`;

function readTier(uid: string): TierCache | null {
  try { const r = localStorage.getItem(TIER_KEY(uid)); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function writeTier(uid: string, tier: UserTier, emailVerified: boolean) {
  try {
    localStorage.setItem(TIER_KEY(uid), JSON.stringify({
      tier, ev: emailVerified,
    }));
  } catch {}
}
function clearTier(uid: string) {
  try { localStorage.removeItem(TIER_KEY(uid)); } catch {}
}

// 存非敏感展示信息，token 不在此处。刷新页面时同步读取，零延迟渲染。
const SNAP_KEY = 'gsyen_user_snap';
interface UserSnap { uid: string; email: string; tier: UserTier | null; ev: boolean; provider: LoginProvider | null; }
function _readSnap(): UserSnap | null {
  try { const r = localStorage.getItem(SNAP_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
let _snap = _readSnap();
function _writeSnap(s: UserSnap) { _snap = s; try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch {} }
function _clearSnap()             { _snap = null; try { localStorage.removeItem(SNAP_KEY); } catch {} }

// 所有 useAuth() 调用共享同一份状态，boot/listener 只初始化一次。
interface AuthStore extends AuthState { justVerified: boolean; }

export function resolveCachedTier(
  cached: TierCache | null,
  snap: UserSnap | null,
  uid: string,
): TierCache | null {
  if (cached) return cached;
  if (snap?.uid === uid && snap.tier) return { tier: snap.tier, ev: snap.ev };
  return null;
}
function readCachedTier(uid: string): TierCache | null {
  return resolveCachedTier(readTier(uid), _snap, uid);
}
export async function retryNull<T>(load: () => Promise<T | null>, delays = [0, 250, 750], isCurrent = () => true) {
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (!isCurrent()) return null;
    const value = await load();
    if (!isCurrent()) return null;
    if (value !== null) return value;
  }
  return null;
}
let _store: AuthStore = {
  ...DEFAULT_AUTH_STATE,
  justVerified: false,
  ...(_snap ? {
    // 快照用户：仅含展示字段，onAuthStateChange 触发后替换为真实 User 对象
    user:          { id: _snap.uid, email: _snap.email, user_metadata: {}, app_metadata: {}, aud: '' } as any,
    tier:          _snap.tier,
    emailVerified: _snap.ev,
    loginProvider: _snap.provider,
  } : {}),
};
let _initialized = false;
let _currentUid: string | null = null;
const _listeners = new Set<(s: AuthStore) => void>();
const _tierRefreshes = new Map<string, Promise<UserTier | null>>();

// 读取页面加载时的 hash（魔法链接），模块初始化即捕获，防止后续被清除后读不到
const _magicLinkOnLoad =
  typeof window !== 'undefined' &&
  (window.location.hash.includes('type=magiclink') || window.location.hash.includes('type=email'));
let _magicLinkHandled = false;

function _set(patch: Partial<AuthStore>) {
  _store = { ..._store, ...patch };
  _listeners.forEach(fn => fn(_store));
}

function _applyTier(
  user: NonNullable<AuthState['user']>,
  provider: LoginProvider | null,
  tier: UserTier | null,
  emailVerified: boolean,
  justVerified = false,
) {
  if (!tier || _store.user?.id !== user.id) return;
  writeTier(user.id, tier, emailVerified);
  _set({
    tier,
    emailVerified,
    ...(justVerified && emailVerified ? { justVerified: true } : {}),
  });
  _writeSnap({
    uid: user.id,
    email: user.email ?? '',
    tier,
    ev: emailVerified,
    provider,
  });
}

function _refreshTier(
  user: NonNullable<AuthState['user']>,
  provider: LoginProvider | null,
): Promise<UserTier | null> {
  const active = _tierRefreshes.get(user.id);
  if (active) return active;
  const requestedSession = _store.session;
  const requestIsCurrent = () => requestedSession?.user.id === user.id && _store.session === requestedSession;
  const request = retryNull(
    () => initializeUserData(user.id, provider ?? 'email'), undefined, requestIsCurrent,
  )
    .then(membership => {
      if (!requestIsCurrent()) return null;
      _applyTier(
        user,
        provider,
        membership?.tier ?? null,
        membership?.emailVerified ?? false,
      );
      return membership?.tier ?? null;
    })
    .finally(() => {
      if (_tierRefreshes.get(user.id) === request) _tierRefreshes.delete(user.id);
    });
  _tierRefreshes.set(user.id, request);
  return request;
}

function _refreshCurrentTier() {
  const user = _store.session?.user;
  if (!user) return;
  const provider = (user.user_metadata?.provider ?? null) as LoginProvider | null;
  _refreshTier(user, provider).catch(() => {});
}

function _initListener() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;

    if (_event === 'SIGNED_OUT' || !user) {
      // bootstrap 阶段 _currentUid=null，Supabase 会发 INITIAL_SESSION(null)
      // 忽略这个事件，避免清掉快照。只有已确认过 session 后的真实登出才处理。
      if (_currentUid) {
        clearTier(_currentUid);
        _currentUid = null;
        _clearSnap();
        _set({ ...DEFAULT_AUTH_STATE, loading: false, justVerified: false });
      }
      return;
    }

    const prevUid = _currentUid;
    _currentUid = user.id;
    const provider = (user.user_metadata?.provider ?? null) as LoginProvider | null;

    if (session?.refresh_token) authProxy.saveSession(session.refresh_token).catch(() => {});

    // TOKEN_REFRESHED：同一用户只更新 session/user，不重置 tier/emailVerified（防闪烁）
    if (_event === 'TOKEN_REFRESHED' && prevUid === user.id) {
      _set({ user, session, loginProvider: provider });
      _refreshTier(user, provider).catch(() => {});
      return;
    }

    const cached = readCachedTier(user.id);
    _set({
      user, session,
      tier: cached?.tier ?? null,
      emailVerified: cached?.ev ?? false,
      loginProvider: provider,
      loading: false,
      isPasswordRecovery: _event === 'PASSWORD_RECOVERY',
    });
    // 立即写快照（使用缓存 tier），tier 加载后再更新一次
    _writeSnap({ uid: user.id, email: user.email ?? '', tier: cached?.tier ?? null, ev: cached?.ev ?? false, provider });

    // 魔法链接验证：升级 tier
    if (_magicLinkOnLoad && !_magicLinkHandled) {
      _magicLinkHandled = true;
      window.history.replaceState(null, '', window.location.pathname);
      upgradeTierToFree(user.id)
        .then(membership => {
          _applyTier(
            user,
            provider,
            membership?.tier ?? null,
            membership?.emailVerified ?? false,
            true,
          );
        })
        .catch(() => {});
      return;
    }

    _refreshTier(user, provider).catch(() => {});
  });
}

function _boot() {
  if (_initialized) return;
  _initialized = true;

  if (!supabase) { _set({ loading: false }); return; }

  _initListener();
  window.addEventListener('focus', _refreshCurrentTier);
  window.addEventListener('online', _refreshCurrentTier);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _refreshCurrentTier();
  });

  (async () => {
    try {
      // The Supabase client consumes OAuth callback URL parameters during
      // initialization when detectSessionInUrl is enabled. Read that session
      // through the supported v2 API after initialization completes.
      const callback = await supabase.auth.getSession();
      if (callback.data.session) {
        const user = callback.data.session.user;
        const cached = readCachedTier(user.id);
        _currentUid = user.id;
        _set({
          user,
          session: callback.data.session,
          tier: cached?.tier ?? null,
          emailVerified: cached?.ev ?? false,
          loginProvider: (user.user_metadata?.provider ?? null) as LoginProvider | null,
          loading: false,
          isPasswordRecovery: false,
        });
        const provider = (user.user_metadata?.provider ?? null) as LoginProvider | null;
        _writeSnap({
          uid: user.id,
          email: user.email ?? '',
          tier: cached?.tier ?? null,
          ev: cached?.ev ?? false,
          provider,
        });
        if (callback.data.session.refresh_token) authProxy.saveSession(callback.data.session.refresh_token).catch(() => {});
        _refreshTier(user, provider).catch(() => {});
        return;
      }

      // Step 1: 本地 Supabase session（无网络，< 50ms）
      const { data: { session: local } } = await supabase.auth.getSession();

      if (local?.user && local.access_token) {
        const cached = readCachedTier(local.user.id);
        _currentUid = local.user.id;
        _set({
          user: local.user, session: local,
          tier: cached?.tier ?? null,
          emailVerified: cached?.ev ?? false,
          loading: false,
        });
        const provider = (local.user.user_metadata?.provider ?? null) as LoginProvider | null;
        _refreshTier(local.user, provider).catch(() => {});
        if (local.refresh_token) authProxy.saveSession(local.refresh_token).catch(() => {});
        return;
      }

      // Step 2: 从同域 HttpOnly Cookie 恢复会话。阿里云的 gsyen-api
      // 是唯一生产入口；不成功时必须清除展示快照，避免“看似登录、实际无 token”。
      let me: Awaited<ReturnType<typeof authProxy.me>> = { ok: false };
      for (let i = 0; i < 3; i++) {
        me = await authProxy.me();
        if (me.ok || me.status === 401) break;
        if (i < 2) await new Promise(resolve => setTimeout(resolve, 1_000 * (i + 1)));
      }
      if (_currentUid) return;
      if (me.ok && me.access_token && me.refresh_token) {
        await supabase.auth.setSession({
          access_token: me.access_token,
          refresh_token: me.refresh_token,
        });
        return;
      }
      if (me.status === 401) {
        _clearSnap();
        _currentUid = null;
        _set({ ...DEFAULT_AUTH_STATE, loading: false, justVerified: false });
      } else {
        _set({ loading: false });
      }
    } catch {
      _set({ loading: false });
    }
  })();
}

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
    signOut:               useCallback(async () => {
      const uid = _currentUid ?? _store.user?.id ?? _snap?.uid ?? null;
      const result = await signOut();
      if (result.success) {
        if (uid) clearTier(uid);
        _currentUid = null;
        _clearSnap();
        _set({ ...DEFAULT_AUTH_STATE, loading: false, justVerified: false });
      }
      return result;
    }, []),
    resetPasswordForEmail: useCallback((e: string)            => resetPasswordForEmail(e), []),
  };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
