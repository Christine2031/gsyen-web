import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// 清除旧版 localStorage 残留 token（一次性迁移）
try {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('sb-')) localStorage.removeItem(k);
  });
} catch {}

/**
 * 全局单例 Supabase 客户端
 *
 * persistSession: false — token 只存 JS 内存，不写 localStorage / cookie。
 * 刷新页面后内存清空；由 useAuth 启动时调 gsyenApiProxy.me() 从 HttpOnly
 * cookie（gsyen_rt）重建 session，实现 Google 令牌管理模型：
 *   access_token  → JS 内存（XSS 无法持久化）
 *   refresh_token → HttpOnly cookie（XSS 完全不可读）
 *
 * detectSessionInUrl: true — OAuth redirect 后自动从 URL hash 提取 token。
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});

if ((window as any).__supabaseClient && (window as any).__supabaseClient !== supabase) {
  console.warn('⚠️ Multiple Supabase client instances detected.');
}
(window as any).__supabaseClient = supabase;
