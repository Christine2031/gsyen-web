import type { User, Session } from '@supabase/supabase-js';

/** 用户层级（会员体系） */
export type UserTier = 'free_unverified' | 'free' | 'pro_month' | 'pro_year' | 'enterprise' | 'admin' | 'owner';

/** OAuth 提供商 */
export type OAuthProvider = 'google' | 'github';

/** 登录来源 */
export type LoginProvider = 'email' | 'google' | 'github';

/** 认证状态 */
export interface AuthState {
  user: User | null;
  session: Session | null;
  tier: UserTier | null;
  emailVerified: boolean;
  loginProvider: LoginProvider | null;
  loading: boolean;
  isPasswordRecovery: boolean;
}

/** 认证错误 */
export interface AuthError {
  code?: string;
  message: string;
  details?: Record<string, any>;
}

/** 登录结果 */
export interface AuthResult {
  success: boolean;
  error?: AuthError;
  user?: User;
  session?: Session;
}
