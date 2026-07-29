import { describe, expect, it, vi } from 'vitest';
import { codexProcessEnv } from './codexProcessEnv';

describe('codexProcessEnv', () => {
  it('uses an explicitly configured Codex proxy', async () => {
    const env = await codexProcessEnv(
      { CODEX_PROXY_URL: 'socks5h://127.0.0.1:9999' },
      vi.fn(),
    );

    expect(env.ALL_PROXY).toBe('socks5h://127.0.0.1:9999');
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
  });

  it('promotes an existing standard proxy to every supported variable', async () => {
    const env = await codexProcessEnv(
      { HTTPS_PROXY: 'http://proxy.example:8080' },
      vi.fn(),
    );

    expect(env.ALL_PROXY).toBe('http://proxy.example:8080');
    expect(env.HTTP_PROXY).toBe('http://proxy.example:8080');
  });

  it('does not leave a SOCKS URL in HTTP proxy variables', async () => {
    const proxy = 'socks5h://127.0.0.1:9999';
    const env = await codexProcessEnv(
      { ALL_PROXY: proxy, HTTPS_PROXY: proxy, HTTP_PROXY: proxy },
      vi.fn(),
    );

    expect(env.ALL_PROXY).toBe(proxy);
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
  });

  it('uses the local SOCKS proxy only when its port is reachable', async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const env = await codexProcessEnv({}, probe);

    expect(probe).toHaveBeenCalledWith('127.0.0.1', 10808);
    expect(env.ALL_PROXY).toBe('socks5h://127.0.0.1:10808');
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
  });

  it('keeps direct networking when no proxy is configured or reachable', async () => {
    const env = await codexProcessEnv({}, vi.fn().mockResolvedValue(false));

    expect(env.ALL_PROXY).toBeUndefined();
    expect(env.NO_COLOR).toBe('1');
  });
});
