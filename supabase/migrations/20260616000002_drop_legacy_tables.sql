-- Drop HalfSphere legacy tables (confirmed no references in gsyen-web codebase).
-- These predate the gsyen_ prefix convention; all active tables use gsyen_ prefix.
-- Run in Supabase SQL Editor AFTER migration 000001 (step 2 of 3).
-- Drops in dependency order: child tables before parent tables.

DROP TABLE IF EXISTS public.team_members      CASCADE;
DROP TABLE IF EXISTS public.teams             CASCADE;
DROP TABLE IF EXISTS public.user_tiers        CASCADE;
DROP TABLE IF EXISTS public.sanyuanlou_members CASCADE;
DROP TABLE IF EXISTS public.network_snapshots  CASCADE;
DROP TABLE IF EXISTS public.usage_snapshots    CASCADE;
DROP TABLE IF EXISTS public.network_nodes      CASCADE;
DROP TABLE IF EXISTS public.subscriptions      CASCADE;
DROP TABLE IF EXISTS public.budgets            CASCADE;
DROP TABLE IF EXISTS public.providers          CASCADE;
