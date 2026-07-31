// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveGsyenApiBase } from './gsyenApiProxy';

describe('gsyen API proxy base', () => {
  it('uses same-origin auth on the web so refresh cookies stay first-party', () => {
    expect(resolveGsyenApiBase(undefined, 'https:')).toBe('');
  });

  it('keeps the Cloud Run auth bridge for packaged Electron file URLs', () => {
    expect(resolveGsyenApiBase(undefined, 'file:')).toBe('https://gsyen-api-776196228503.asia-east1.run.app');
  });

  it('respects an explicit API override', () => {
    expect(resolveGsyenApiBase('https://api.gsyen.com/')).toBe('https://api.gsyen.com');
  });
});