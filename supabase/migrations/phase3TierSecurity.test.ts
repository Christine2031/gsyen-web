import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260729000002_phase3_tier_security.sql', import.meta.url),
  'utf-8',
);

describe('phase 3 membership security migration contract', () => {
  it('removes direct client writes and reads from the entitlement table', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "gsyen_user_tiers_select"/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "gsyen_user_tiers_insert"/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "gsyen_user_tiers_update"/);
    expect(sql).toMatch(
      /REVOKE SELECT, INSERT, UPDATE, DELETE\s+ON TABLE public\.gsyen_user_tiers FROM anon, authenticated/,
    );
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*gsyen_user_tiers[\s\S]*FOR UPDATE/);
  });

  it('derives identity and verification from auth.users inside a hardened RPC', () => {
    expect(sql).toMatch(/FUNCTION public\.gsyen_resolve_my_tier\(\)/);
    expect(sql).toMatch(/current_user_id UUID := auth\.uid\(\)/);
    expect(sql).toMatch(/auth\.users/);
    expect(sql).toMatch(/email_confirmed_at/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).not.toMatch(/p_user_id/);
  });

  it('does not trust legacy elevated rows without server attestation', () => {
    expect(sql).toMatch(/entitlement_verified_at/);
    expect(sql).toMatch(/entitlement_source/);
    expect(sql).toMatch(/IN \('pro_month', 'pro_year', 'enterprise', 'admin', 'owner'\)/);
    expect(sql).toMatch(
      /tiers\.entitlement_verified_at,[\s\S]*tiers\.entitlement_source[\s\S]*attested_at IS NULL[\s\S]*attestation_source[\s\S]*WHEN confirmed_at IS NULL THEN 'free_unverified'[\s\S]*ELSE 'free'/,
    );
    expect(sql).toMatch(
      /stored_tier = 'free' AND confirmed_at IS NULL[\s\S]*stored_tier := 'free_unverified'/,
    );
    expect(sql).toMatch(/FROM public\.gsyen_resolve_my_tier\(\) AS resolved/);
  });

  it('only exposes the resolver and quota RPCs to authenticated users', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.gsyen_resolve_my_tier\(\) FROM PUBLIC, anon/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.gsyen_resolve_my_tier\(\) TO authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.gsyen_consume_chat_quota\(\) FROM PUBLIC, anon/,
    );
  });
});
