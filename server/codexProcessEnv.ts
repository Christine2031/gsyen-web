import net from 'node:net';

const LOCAL_CODEX_PROXY = 'socks5h://127.0.0.1:10808';

type ProxyProbe = (host: string, port: number) => Promise<boolean>;

function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function configuredProxy(env: NodeJS.ProcessEnv): string {
  return env.CODEX_PROXY_URL
    || env.ALL_PROXY
    || env.HTTPS_PROXY
    || env.HTTP_PROXY
    || '';
}

function withProxy(env: NodeJS.ProcessEnv, proxy: string): NodeJS.ProcessEnv {
  const isSocks = /^socks5h?:\/\//i.test(proxy);
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    NO_COLOR: '1',
    ALL_PROXY: proxy,
  };
  if (isSocks) {
    if (nextEnv.HTTPS_PROXY === proxy) delete nextEnv.HTTPS_PROXY;
    if (nextEnv.HTTP_PROXY === proxy) delete nextEnv.HTTP_PROXY;
    return nextEnv;
  }
  return {
    ...nextEnv,
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
  };
}

export async function codexProcessEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  probe: ProxyProbe = tcpProbe,
): Promise<NodeJS.ProcessEnv> {
  const proxy = configuredProxy(baseEnv);
  if (proxy) return withProxy(baseEnv, proxy);

  const localProxy = new URL(LOCAL_CODEX_PROXY);
  const reachable = await probe(localProxy.hostname, Number(localProxy.port));
  if (reachable) return withProxy(baseEnv, LOCAL_CODEX_PROXY);

  return { ...baseEnv, NO_COLOR: '1' };
}
