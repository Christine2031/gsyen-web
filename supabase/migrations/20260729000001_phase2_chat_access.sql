-- Phase 2 chat boundary:
-- authenticated users receive atomically enforced request quotas.
-- Paid/admin entitlement ownership remains a separate Phase 3 migration.

CREATE TABLE IF NOT EXISTS public.gsyen_chat_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  minute_window TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', now()),
  minute_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
  day_window DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::DATE,
  day_count INTEGER NOT NULL DEFAULT 0 CHECK (day_count >= 0),
  total_count BIGINT NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gsyen_chat_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gsyen_chat_usage_select_own" ON public.gsyen_chat_usage;
CREATE POLICY "gsyen_chat_usage_select_own"
  ON public.gsyen_chat_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.gsyen_consume_chat_quota()
RETURNS TABLE (
  allowed BOOLEAN,
  tier TEXT,
  quota_scope TEXT,
  retry_after_seconds INTEGER,
  minute_remaining INTEGER,
  daily_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_tier TEXT;
  confirmed_at TIMESTAMPTZ;
  minute_limit INTEGER;
  daily_limit INTEGER;
  usage_row public.gsyen_chat_usage%ROWTYPE;
  current_minute TIMESTAMPTZ := date_trunc('minute', now());
  current_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT email_confirmed_at INTO confirmed_at
    FROM auth.users
   WHERE id = current_user_id;

  current_tier := CASE
    WHEN confirmed_at IS NULL THEN 'free_unverified'
    ELSE 'free'
  END;

  INSERT INTO public.gsyen_user_tiers (user_id, tier)
  VALUES (current_user_id, current_tier)
  ON CONFLICT (user_id) DO NOTHING;

  -- Until Phase 3 makes paid tiers server-owned, never trust a client-writable
  -- tier value. Email verification is server-owned in auth.users.
  IF confirmed_at IS NULL THEN
    minute_limit := 3;
    daily_limit := 15;
  ELSE
    minute_limit := 6;
    daily_limit := 50;
  END IF;

  INSERT INTO public.gsyen_chat_usage (user_id)
  VALUES (current_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO usage_row
    FROM public.gsyen_chat_usage
   WHERE user_id = current_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat usage row missing after initialization';
  END IF;

  IF usage_row.minute_window <> current_minute THEN
    usage_row.minute_window := current_minute;
    usage_row.minute_count := 0;
  END IF;
  IF usage_row.day_window <> current_day THEN
    usage_row.day_window := current_day;
    usage_row.day_count := 0;
  END IF;

  IF usage_row.minute_count >= minute_limit THEN
    RETURN QUERY SELECT FALSE, current_tier, 'minute',
      GREATEST(1, 60 - EXTRACT(SECOND FROM now())::INTEGER),
      0, GREATEST(0, daily_limit - usage_row.day_count);
    RETURN;
  END IF;

  IF usage_row.day_count >= daily_limit THEN
    RETURN QUERY SELECT FALSE, current_tier, 'day',
      GREATEST(1, EXTRACT(EPOCH FROM (
        date_trunc('day', now() AT TIME ZONE 'UTC') + INTERVAL '1 day'
        - (now() AT TIME ZONE 'UTC')
      ))::INTEGER),
      GREATEST(0, minute_limit - usage_row.minute_count), 0;
    RETURN;
  END IF;

  usage_row.minute_count := usage_row.minute_count + 1;
  usage_row.day_count := usage_row.day_count + 1;

  UPDATE public.gsyen_chat_usage
     SET minute_window = usage_row.minute_window,
         minute_count = usage_row.minute_count,
         day_window = usage_row.day_window,
         day_count = usage_row.day_count,
         total_count = total_count + 1,
         updated_at = now()
   WHERE user_id = current_user_id;

  RETURN QUERY SELECT TRUE, current_tier, NULL::TEXT, 0,
    minute_limit - usage_row.minute_count,
    daily_limit - usage_row.day_count;
END;
$$;

REVOKE ALL ON FUNCTION public.gsyen_consume_chat_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gsyen_consume_chat_quota() TO authenticated;
