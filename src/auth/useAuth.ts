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

// ── User snapshot (optimistic hydration) ──────────────────────────────────────
// 存非敏感展示信息，token 不在此处。刷新页面时同步读取，零延迟渲染。
const SNAP_KEY = 'gsyen_user_snap';
interface UserSnap { uid: string; email: string; tier: UserTier | null; ev: boolean; provider: LoginProvider | null; }
function _readSnap(): UserSnap | null {
  try { const r = localStorage.getItem(SNAP_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function _writeSnap(s: UserSnap) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch {} }
function _clearSnap()             { try { localStorage.removeItem(SNAP_KEY); }               catch {} }

// ── Singleton store ───────────────────────────────────────────────────────────
// 所有 useAuth() 调用共享同一份状态，boot/listener 只初始化一次。
interface AuthStore extends AuthState { justVerified: boolean; }

const _snap = _readSnap();
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
      return;
    }

    const cached = readTier(user.id);
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
        .then(() => {
          writeTier(user.id, 'free');
          if (_store.user?.id === user.id) {
            _set({ tier: 'free', emailVerified: true, justVerified: true });
            _writeSnap({ uid: user.id, email: user.email ?? '', tier: 'free', ev: true, provider });
          }
        })
        .catch(() => {});
      return;
    }

    if (!cached || _event === 'SIGNED_IN') {
      initializeUserData(user.id, user.user_metadata?.provider ?? 'email')
        .then(tier => {
          if (tier) writeTier(user.id, tier);
          if (_store.user?.id === user.id) {
            const ev = tier !== 'free_unverified' && tier !== null;
            _set({ tier, emailVerified: ev });
            _writeSnap({ uid: user.id, email: user.email ?? '', tier, ev, provider });
          }
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

      // Step 2: 无本地 session → 尝试 HttpOnly cookie
      // 401 = session 确认失效，立即处理；网络/5xx = 临时故障，最多重试 3 次
      let me: Awaited<ReturnType<typeof authProxy.me>> = { ok: false };
      for (let i = 0; i < 3; i++) {
        me = await authProxy.me();
        if (me.ok || me.status === 401) break; // 401 不重试
        if (i < 2) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
      if (_currentUid) return; // 等待期间已手动登录
      if (me.ok) {
        await supabase.auth.setSession({ access_token: me.access_token!, refresh_token: me.refresh_token! });
        return; // onAuthStateChange 接管
      }
      if (me.status === 401) {
        // session 确认过期：清快照，还原未登录态
        _clearSnap();
        _set({ ...DEFAULT_AUTH_STATE, loading: false, justVerified: false });
      } else {
        // 网络/服务器故障：保留快照，用户维持乐观登录态，下次操作时自然处理
        _set({ loading: false });
      }
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
