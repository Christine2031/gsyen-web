import { useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { initializeUserData, resetPasswordForEmail, signInWithEmail, signUpWithEmail, signInWithOAuth, signOut } from './authService';
import type { AuthState, OAuthProvider, UserTier, LoginProvider } from '../types/auth';

const DEFAULT_AUTH_STATE: AuthState = {
  user: null,
  session: null,
  tier: null,
  emailVerified: false,
  loginProvider: null,
  loading: true,
  isPasswordRecovery: false,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(DEFAULT_AUTH_STATE);

  // Effect 1: 初始化 session，cancelled 标志防 StrictMode 竞态
  useEffect(() => {
    if (!supabase) {
      setState(s => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error) {
          setState(s => ({ ...s, loading: false }));
          return;
        }

        const user = data.session?.user ?? null;
        let tier: UserTier | null = null;
        if (user) {
          tier = await initializeUserData(user.id, user.user_metadata?.provider ?? 'email');
          if (cancelled) return;
        }

        setState({
          user,
          session: data.session,
          tier,
          emailVerified: tier !== 'free_unverified' && tier !== null,
          loginProvider: (user?.user_metadata?.provider ?? null) as LoginProvider | null,
          loading: false,
          isPasswordRecovery: false,
        });
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Effect 2: 监听后续认证变化，同步写入 user/session，tier 异步补
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      console.log(`[Auth] Auth state changed: event=${_event}, user=${user?.email ?? 'none'}`);

      setState(s => ({
        ...s,
        user,
        session,
        emailVerified: false,
        loginProvider: (user?.user_metadata?.provider ?? null) as LoginProvider | null,
        loading: false,
        tier: null,
        isPasswordRecovery: _event === 'PASSWORD_RECOVERY',
      }));

      if (user) {
        initializeUserData(user.id, user.user_metadata?.provider ?? 'email')
          .then((tier) => {
            setState(s => s.user?.id === user.id ? { ...s, tier, emailVerified: tier !== 'free_unverified' && tier !== null } : s);
          });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInEmailHandler = useCallback(async (email: string, password: string) => {
    return signInWithEmail(email, password);
  }, []);

  const signUpEmailHandler = useCallback(async (email: string, password: string) => {
    return signUpWithEmail(email, password);
  }, []);

  const signInOAuthHandler = useCallback(async (provider: OAuthProvider) => {
    return signInWithOAuth(provider);
  }, []);

  const signOutHandler = useCallback(async () => {
    return signOut();
  }, []);

  const resetPasswordHandler = useCallback(async (email: string) => {
    return resetPasswordForEmail(email);
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setState(s => ({ ...s, isPasswordRecovery: false }));
  }, []);

  return {
    ...state,
    signInWithEmail: signInEmailHandler,
    signUpWithEmail: signUpEmailHandler,
    signInWithOAuth: signInOAuthHandler,
    signOut: signOutHandler,
    resetPasswordForEmail: resetPasswordHandler,
    clearPasswordRecovery,
  };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
