import { authProxy } from './gsyenApiProxy';
import { supabase } from './supabaseClient';

const EXPIRY_SKEW_SECONDS = 30;
let pendingRecovery: Promise<string> | null = null;

function usableAccessToken(session: {
  access_token?: string;
  expires_at?: number;
} | null): string {
  if (!session?.access_token) return '';
  if (
    typeof session.expires_at === 'number'
    && session.expires_at <= Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS
  ) {
    return '';
  }
  return session.access_token;
}

async function recoverAccessToken(): Promise<string> {
  const restored = await authProxy.me();
  if (!restored.ok || !restored.access_token || !restored.refresh_token) return '';

  const { data, error } = await supabase.auth.setSession({
    access_token: restored.access_token,
    refresh_token: restored.refresh_token,
  });
  if (error) return '';
  return usableAccessToken(data.session);
}

export async function getChatAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const current = usableAccessToken(data.session);
  if (current) return current;

  if (!pendingRecovery) {
    pendingRecovery = recoverAccessToken().finally(() => {
      pendingRecovery = null;
    });
  }
  return pendingRecovery;
}
