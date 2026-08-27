// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveGsyenApiBase } from './gsyenApiProxy';

describe('gsyen API proxy base', () => {
  it('uses same-origin auth on the web so refresh cookies stay first-party', () => {
    expect(resolveGsyenApiBase(undefined, 'https:')).toBe('');
  });

  it('ignores a configured cross-origin API override in web browsers', () => {
    expect(resolveGsyenApiBase('https://api-shadow.gsyen.example/', 'https:')).toBe('');
    expect(resolveGsyenApiBase('https://api-shadow.gsyen.example/', 'http:')).toBe('');
  });

  it('fails closed without an Electron API origin', () => {
    expect(() => resolveGsyenApiBase(undefined, 'file:')).toThrow(
      'VITE_GSYEN_API_URL is required',
    );
  });

  it('respects an explicit API override only in packaged Electron', () => {
    expect(resolveGsyenApiBase('https://api.gsyen.com/', 'file:')).toBe('https://api.gsyen.com');
  });

  it('defaults safely to same-origin without a file protocol', () => {
    expect(resolveGsyenApiBase('https://api.gsyen.com/', '')).toBe('');
  });
});
