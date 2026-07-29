-- Phase 3 membership boundary:
-- tier ownership moves from client-writable rows to authenticated server RPCs.
-- Existing elevated rows remain visible for audit but are treated as free until
-- a trusted backend records an entitlement attestation.

ALTER TABLE public.gsyen_user_tiers
  ADD COLUMN IF NOT EXISTS entitlement_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entitlement_source TEXT;

ALTER TABLE public.gsyen_user_tiers
  DROP CONSTRAINT IF EXISTS gsyen_user_tiers_tier_check;

ALTER TABLE public.gsyen_user_tiers
  ADD CONSTRAINT gsyen_user_tiers_tier_check
  CHECK (
    tier IN (
      'free_unverified', 'free', 'pro_month', 'pro_year',
      'enterprise', 'admin', 'owner'
    )
  ) NOT VALID;

ALTER TABLE public.gsyen_user_tiers
  VALIDATE CONSTRAINT gsyen_user_tiers_tier_check;

ALTER TABLE public.gsyen_user_tiers
  DROP CONSTRAINT IF EXISTS gsyen_tier_entitlement_attestation_check;

ALTER TABLE public.gsyen_user_tiers
  ADD CONSTRAINT gsyen_tier_entitlement_attestation_check
  CHECK (
    (
      entitlement_verified_at IS NULL
      AND entitlement_source IS NULL
    )
    OR (
      entitlement_verified_at IS NOT NULL
      AND NULLIF(BTRIM(entitlement_source), '') IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.gsyen_user_tiers
  VALIDATE CONSTRAINT gsyen_tier_entitlement_attestation_check;

DROP POLICY IF EXISTS "gsyen_user_tiers_select" ON public.gsyen_user_tiers;
DROP POLICY IF EXISTS "gsyen_user_tiers_insert" ON public.gsyen_user_tiers;
DROP POLICY IF EXISTS "gsyen_user_tiers_update" ON public.gsyen_user_tiers;

REVOKE SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.gsyen_user_tiers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.gsyen_resolve_my_tier()
RETURNS TABLE (
  tier TEXT,
  email_verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  confirmed_at TIMESTAMPTZ;
  resolved_provider TEXT;
  stored_tier TEXT;
  attested_at TIMESTAMPTZ;
  attestation_source TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT
    users.email_confirmed_at,
    CASE
      WHEN users.raw_app_meta_data ->> 'provider'
        IN ('email', 'google', 'github', 'discord', 'facebook')
      THEN users.raw_app_meta_data ->> 'provider'
      ELSE 'email'
    END
  INTO confirmed_at, resolved_provider
  FROM auth.users AS users
  WHERE users.id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'authenticated user not found';
  END IF;

  INSERT INTO public.gsyen_user_tiers AS tiers (
    user_id,
    tier,
    login_provider,
    email_verified_at
  )
  VALUES (
    current_user_id,
    CASE WHEN confirmed_at IS NULL THEN 'free_unverified' ELSE 'free' END,
    resolved_provider,
    confirmed_at
  )
  ON CONFLICT (user_id) DO UPDATE
    SET login_provider = EXCLUDED.login_provider,
        email_verified_at = COALESCE(
          tiers.email_verified_at,
          EXCLUDED.email_verified_at
        ),
        tier = CASE
          WHEN tiers.tier = 'free_unverified'
            AND EXCLUDED.email_verified_at IS NOT NULL
          THEN 'free'
          ELSE tiers.tier
        END
    WHERE tiers.login_provider IS DISTINCT FROM EXCLUDED.login_provider
       OR tiers.email_verified_at IS DISTINCT FROM COALESCE(
         tiers.email_verified_at,
         EXCLUDED.email_verified_at
       )
       OR tiers.tier IS DISTINCT FROM CASE
         WHEN tiers.tier = 'free_unverified'
           AND EXCLUDED.email_verified_at IS NOT NULL
         THEN 'free'
         ELSE tiers.tier
       END
  RETURNING
    tiers.tier,
    tiers.entitlement_verified_at,
    tiers.entitlement_source
  INTO stored_tier, attested_at, attestation_source;

  IF NOT FOUND THEN
    SELECT
      tiers.tier,
      tiers.entitlement_verified_at,
      tiers.entitlement_source
    INTO stored_tier, attested_at, attestation_source
    FROM public.gsyen_user_tiers AS tiers
    WHERE tiers.user_id = current_user_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership row missing after resolution';
  END IF;

  IF stored_tier = 'free' AND confirmed_at IS NULL THEN
    stored_tier := 'free_unverified';
  ELSIF stored_tier
      IN ('pro_month', 'pro_year', 'enterprise', 'admin', 'owner')
      AND (
        attested_at IS NULL
        OR NULLIF(BTRIM(attestation_source), '') IS NULL
      ) THEN
    stored_tier := CASE
      WHEN confirmed_at IS NULL THEN 'free_unverified'
      ELSE 'free'
    END;
  END IF;

  RETURN QUERY SELECT stored_tier, confirmed_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.gsyen_resolve_my_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gsyen_resolve_my_tier() TO authenticated;

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
  minute_limit INTEGER;
  daily_limit INTEGER;
  usage_row public.gsyen_chat_usage%ROWTYPE;
  current_minute TIMESTAMPTZ := date_trunc('minute', now());
  current_day DATE := (now() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT resolved.tier
  INTO current_tier
  FROM public.gsyen_resolve_my_tier() AS resolved;

  IF current_tier = 'free_unverified' THEN
    minute_limit := 3;
    daily_limit := 15;
  ELSE
    -- Preserve Phase 2 product limits while moving tier trust server-side.
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
