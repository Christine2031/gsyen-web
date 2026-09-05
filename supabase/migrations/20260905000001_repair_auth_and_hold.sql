-- Repair the production schema after the interrupted team/tier rollout.
-- This migration is additive and idempotent: it never deletes user data.

ALTER TABLE public.gsyen_user_tiers
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.gsyen_hold (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS gsyen_hold_user_id_idx
  ON public.gsyen_hold (user_id);

ALTER TABLE public.gsyen_hold ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gsyen_hold_select_own" ON public.gsyen_hold;
DROP POLICY IF EXISTS "gsyen_hold_insert_own" ON public.gsyen_hold;
DROP POLICY IF EXISTS "gsyen_hold_update_own" ON public.gsyen_hold;
DROP POLICY IF EXISTS "gsyen_hold_delete_own" ON public.gsyen_hold;

CREATE POLICY "gsyen_hold_select_own"
  ON public.gsyen_hold FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "gsyen_hold_insert_own"
  ON public.gsyen_hold FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gsyen_hold_update_own"
  ON public.gsyen_hold FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gsyen_hold_delete_own"
  ON public.gsyen_hold FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gsyen_hold TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gsyen_hold TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gsyen_hold'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gsyen_hold;
  END IF;
END;
$$;
