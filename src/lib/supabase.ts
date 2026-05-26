import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatSession {
  id:         string;
  user_id:    string;
  title:      string;
  model:      string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id:         string;
  session_id: string;
  user_id:    string;
  role:       'user' | 'model';
  content:    string;
  created_at: string;
}
