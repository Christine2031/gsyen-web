import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./codexAppServerProcess.ts', import.meta.url),
  'utf8',
);

describe('Codex app-server transport boundary', () => {
  it('uses the private stdio transport instead of a loopback listener', () => {
    expect(source).toContain("'--listen', 'stdio://'");
    expect(source).not.toMatch(/ws:\/\/127\.0\.0\.1/);
    expect(source).not.toMatch(/readyz/);
  });

  it('keeps protocol output and diagnostics on separate streams', () => {
    expect(source).toMatch(/stdio: \['pipe', 'pipe', 'pipe'\]/);
    expect(source).toMatch(/spawned\.stdout\?\.on\('data', dispatchStdout\)/);
    expect(source).toMatch(/spawned\.stderr\?\.on\('data'/);
  });
});
