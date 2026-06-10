import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const NOT_CONFIGURED = { error: { message: 'Supabase not configured' } } as any;

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: false });

  useEffect(() => {
    if (!supabase) return;
    setState(s => ({ ...s, loading: true }));
    supabase.auth.getSession().then(({ data }) => {
      setState({ user: data.session?.user ?? null, session: data.session, loading: false });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () =>
    supabase ? supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
             : Promise.resolve(NOT_CONFIGURED);

  const signInWithEmail = (email: string, password: string) =>
    supabase ? supabase.auth.signInWithPassword({ email, password })
             : Promise.resolve(NOT_CONFIGURED);

  const signUpWithEmail = (email: string, password: string) =>
    supabase ? supabase.auth.signUp({ email, password })
             : Promise.resolve(NOT_CONFIGURED);

  const signOut = () =>
    supabase ? supabase.auth.signOut() : Promise.resolve({ error: null });

  return { ...state, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut };
}
