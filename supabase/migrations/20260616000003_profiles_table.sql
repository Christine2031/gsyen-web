-- Introduce public.profiles as a stable identity layer between auth.users
-- and all business tables, reducing auth.users fan-in from ~17 to 1.
--
-- Cascade chain after this migration:
--   auth.users → profiles (CASCADE) → all 17 business tables (CASCADE)
--
-- No data migration needed: profiles.id = auth.users.id (same UUID values).
-- No code changes needed: RLS still uses auth.uid(), queries still use user_id.
-- Run in Supabase SQL Editor AFTER migration 000002 (step 3 of 3).

-- ── 1. Create profiles table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: owner read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- ── 2. Backfill existing users ───────────────────────────────────────────────

INSERT INTO public.profiles (id, email, created_at)
SELECT id, email, created_at FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── 3. Auto-create profile on every new signup ───────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. Migrate all 17 business table FKs: auth.users → profiles ──────────────

ALTER TABLE public.gsyen_kanban_tasks
  DROP CONSTRAINT IF EXISTS gsyen_kanban_tasks_user_id_fkey,
  ADD CONSTRAINT gsyen_kanban_tasks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_calendar_events
  DROP CONSTRAINT IF EXISTS gsyen_calendar_events_user_id_fkey,
  ADD CONSTRAINT gsyen_calendar_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_emails
  DROP CONSTRAINT IF EXISTS gsyen_emails_user_id_fkey,
  ADD CONSTRAINT gsyen_emails_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_chat_sessions
  DROP CONSTRAINT IF EXISTS gsyen_chat_sessions_user_id_fkey,
  ADD CONSTRAINT gsyen_chat_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_user_tiers
  DROP CONSTRAINT IF EXISTS gsyen_user_tiers_user_id_fkey,
  ADD CONSTRAINT gsyen_user_tiers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_teams
  DROP CONSTRAINT IF EXISTS gsyen_teams_owner_id_fkey,
  ADD CONSTRAINT gsyen_teams_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_team_members
  DROP CONSTRAINT IF EXISTS gsyen_team_members_user_id_fkey,
  ADD CONSTRAINT gsyen_team_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_events
  DROP CONSTRAINT IF EXISTS gsyen_events_user_id_fkey,
  ADD CONSTRAINT gsyen_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_transactions
  DROP CONSTRAINT IF EXISTS gsyen_transactions_user_id_fkey,
  ADD CONSTRAINT gsyen_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_kanban_cols
  DROP CONSTRAINT IF EXISTS gsyen_kanban_cols_user_id_fkey,
  ADD CONSTRAINT gsyen_kanban_cols_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_kanban_cards
  DROP CONSTRAINT IF EXISTS gsyen_kanban_cards_user_id_fkey,
  ADD CONSTRAINT gsyen_kanban_cards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_orders
  DROP CONSTRAINT IF EXISTS gsyen_orders_user_id_fkey,
  ADD CONSTRAINT gsyen_orders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_canvas_docs
  DROP CONSTRAINT IF EXISTS gsyen_canvas_docs_user_id_fkey,
  ADD CONSTRAINT gsyen_canvas_docs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_vault
  DROP CONSTRAINT IF EXISTS gsyen_vault_user_id_fkey,
  ADD CONSTRAINT gsyen_vault_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_prism_profile
  DROP CONSTRAINT IF EXISTS gsyen_prism_profile_user_id_fkey,
  ADD CONSTRAINT gsyen_prism_profile_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.gsyen_prism_corpus
  DROP CONSTRAINT IF EXISTS gsyen_prism_corpus_user_id_fkey,
  ADD CONSTRAINT gsyen_prism_corpus_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
