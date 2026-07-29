import type { ModelHealth } from '../hooks/useModelHealth';

const DEV_BRIDGE_BASES = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];
const DEFAULT_PROBE_TIMEOUT_MS = 1200;
const PROBE_CACHE_MS = 2500;

interface BridgeCandidate {
  base: string;
  headers: Record<string, string>;
}

export interface LocalBridgeProbe extends BridgeCandidate {
  health: ModelHealth;
}

let cachedProbe: { value: LocalBridgeProbe | null; timestamp: number } | null = null;
let pendingProbe: Promise<LocalBridgeProbe | null> | null = null;

function isLoopbackBase(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Boolean(url.port);
  } catch {
    return false;
  }
}

async function bridgeCandidates(): Promise<BridgeCandidate[]> {
  const config = await (window as any).electronAPI?.localBridge?.getConfig?.();
  if (isLoopbackBase(config?.base) && typeof config?.token === 'string' && config.token) {
    return [{
      base: config.base,
      headers: { 'X-GSYEN-Bridge-Token': config.token },
    }];
  }

  const devToken = import.meta.env.DEV ? import.meta.env.VITE_LOCAL_BRIDGE_TOKEN : '';
  if (typeof devToken === 'string' && devToken) {
    return DEV_BRIDGE_BASES.map(base => ({
      base,
      headers: { 'X-GSYEN-Bridge-Token': devToken },
    }));
  }
  return [];
}

async function fetchJsonWithTimeout(
  candidate: BridgeCandidate,
  path: string,
  timeoutMs: number,
): Promise<any> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${candidate.base}${path}`, {
      cache: 'no-store',
      mode: 'cors',
      headers: candidate.headers,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeLocalChatGptBridge(
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  force = false,
): Promise<LocalBridgeProbe | null> {
  const now = Date.now();
  if (!force && cachedProbe && now - cachedProbe.timestamp < PROBE_CACHE_MS) {
    return cachedProbe.value;
  }
  if (!force && pendingProbe) return pendingProbe;

  pendingProbe = (async () => {
    for (const candidate of await bridgeCandidates()) {
      try {
        const model = await fetchJsonWithTimeout(candidate, '/api/codex/health', timeoutMs);
        if (!model || typeof model !== 'object') continue;
        const health: ModelHealth = model.available
          ? { status: 'online', authMode: model.authMode ?? 'chatgpt' }
          : { status: 'offline', error: model.error ?? 'LOCAL BRIDGE OFFLINE' };
        return { ...candidate, health };
      } catch {
        // Try the next explicitly authorized development endpoint.
      }
    }
    return null;
  })().finally(() => {
    pendingProbe = null;
  });

  const value = await pendingProbe;
  cachedProbe = { value, timestamp: Date.now() };
  return value;
}

export async function localChatGptGatewayBase(): Promise<string> {
  const probe = await probeLocalChatGptBridge();
  return probe?.health.status === 'online' ? probe.base : '';
}

export async function startLocalChatGptBind(timeoutMs = 2500): Promise<Response | null> {
  for (const candidate of await bridgeCandidates()) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${candidate.base}/api/codex/login/start`, {
        method: 'POST',
        mode: 'cors',
        headers: candidate.headers,
        signal: controller.signal,
      });
      if (res.status !== 404) return res;
    } catch {
      // Try the next explicitly authorized development endpoint.
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}
