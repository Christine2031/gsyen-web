import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260729000001_phase2_chat_access.sql', import.meta.url),
  'utf-8',
);

describe('phase 2 chat quota migration contract', () => {
  it('meters authenticated users atomically and fails closed for anonymous callers', () => {
    expect(sql).toMatch(/current_user_id UUID := auth\.uid\(\)/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/REVOKE ALL .* FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE .* TO authenticated/);
  });

  it('does not grant larger quotas from the client-writable tier table', () => {
    expect(sql).toMatch(/SELECT email_confirmed_at INTO confirmed_at[\s\S]*FROM auth\.users/);
    expect(sql).toMatch(/IF confirmed_at IS NULL THEN[\s\S]*minute_limit := 3/);
    expect(sql).not.toMatch(/SELECT u\.tier INTO current_tier/);
    expect(sql).not.toMatch(/WHEN 'pro_month'/);
    expect(sql).not.toMatch(/WHEN 'enterprise'/);
    expect(sql).not.toMatch(/daily_limit := 1000/);
  });

  it('does not change membership policies during the chat-only phase', () => {
    expect(sql).not.toMatch(/DROP POLICY .*gsyen_user_tiers/);
    expect(sql).not.toMatch(/CREATE POLICY .*gsyen_user_tiers/);
  });
});
