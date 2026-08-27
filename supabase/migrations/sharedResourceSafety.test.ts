import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./20260616000002_drop_legacy_tables.sql', import.meta.url),
  'utf8',
);
const executableSql = migration.replace(/^--.*$/gm, '');

describe('shared database resource safety', () => {
  it('never drops HalfSphere or shared control-plane tables', () => {
    expect(executableSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executableSql).not.toMatch(/\bCASCADE\b/i);
  });

  it('documents why the migration is quarantined', () => {
    expect(migration).toMatch(/SAFETY QUARANTINE/);
    expect(migration).toMatch(/HalfSphere\/shared-control-plane/);
  });
});
