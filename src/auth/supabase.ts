// Supabase client — wired when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set.
// Until then, all auth calls are no-ops (see useAuth.ts).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = url && url.startsWith('https://') && key
  ? createClient(url, key)
  : null;
