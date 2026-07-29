const {
  getLocalBridgeConfig,
  startLocalServer,
  stopLocalServer,
} = require('../electron/local-server.cjs');

let base = process.env.GSYEN_SMOKE_BASE || 'http://127.0.0.1:3000';
let authHeaders = {};
const DESKTOP = process.argv.includes('--desktop');
const MAX_FIRST_MS = Number(process.env.GSYEN_SMOKE_MAX_FIRST_MS || 4500);
const MAX_RECOVERY_FIRST_MS = Number(process.env.GSYEN_SMOKE_MAX_RECOVERY_MS || 8000);
const SMOKE_ALL_MODELS = process.env.GSYEN_SMOKE_ALL_MODELS === '1';
const CHATGPT_MODELS = ['gpt-5-6-sol', 'gpt-5-6-terra', 'gpt-5-6-luna'];
let startedDesktopServer = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(path, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: authHeaders,
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function isApiReady() {
  try {
    const res = await fetch(`${base}/api/codex/health`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForApi() {
  for (let i = 0; i < 40; i++) {
    if (await isApiReady()) return;
    await sleep(250);
  }
  throw new Error('Local API did not become ready on 127.0.0.1:3000');
}

async function maybeStartDesktopServer() {
  if (DESKTOP) {
    await startLocalServer({ isPackaged: true });
    startedDesktopServer = true;
    const config = await getLocalBridgeConfig();
    if (!config.base || !config.token) throw new Error('Desktop bridge config is unavailable');
    base = config.base;
    authHeaders = { 'X-GSYEN-Bridge-Token': config.token };
    await waitForApi();
    return;
  }

  const bridgeToken = process.env.GSYEN_SMOKE_BRIDGE_TOKEN || process.env.LOCAL_BRIDGE_TOKEN;
  const accessToken = process.env.GSYEN_SMOKE_ACCESS_TOKEN;
  if (bridgeToken) authHeaders = { 'X-GSYEN-Bridge-Token': bridgeToken };
  else if (accessToken) authHeaders = { Authorization: `Bearer ${accessToken}` };
  else {
    throw new Error(
      'Set GSYEN_SMOKE_BRIDGE_TOKEN (or GSYEN_SMOKE_ACCESS_TOKEN), or use --desktop.',
    );
  }
}

async function chat(prompt, options = {}) {
  const controller = new AbortController();
  const started = Date.now();
  let firstDeltaMs = null;
  let text = '';
  let abortTimer = null;

  if (options.abortAfterMs) {
    abortTimer = setTimeout(() => controller.abort(), options.abortAfterMs);
  }

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'chatgpt-pro',
        messages: [{ role: 'user', content: prompt }],
        lang: 'zh',
        chatGptModel: options.chatGptModel || 'gpt-5-6-sol',
      }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
        if (delta && firstDeltaMs === null) firstDeltaMs = Date.now() - started;
        text += delta;
      }
    }

    return { firstDeltaMs, totalMs: Date.now() - started, text: text.trim() };
  } finally {
    if (abortTimer) clearTimeout(abortTimer);
  }
}

function assertReply(label, result, expected) {
  if (!result.text.includes(expected)) {
    throw new Error(`${label} expected ${expected}, got: ${result.text}`);
  }
}

async function main() {
  await maybeStartDesktopServer();
  const health = await fetchJson('/api/codex/health');
  if (!health.available) throw new Error(`ChatGPT bridge unavailable: ${health.error || 'unknown'}`);

  const warm1 = await chat('只回答两个字：在线');
  assertReply('warm1', warm1, '在线');
  const warm2 = await chat('只回答两个字：继续');
  assertReply('warm2', warm2, '继续');

  let abort = null;
  try {
    await chat('写一段很长的中文说明，至少800字。', { abortAfterMs: 800 });
    abort = { aborted: false };
  } catch (err) {
    abort = { aborted: err.name === 'AbortError', name: err.name, message: err.message };
  }
  if (!abort.aborted) throw new Error('Abort smoke did not abort the request');

  const recover = await chat('只回答两个字：恢复');
  assertReply('recover', recover, '恢复');

  const modelChecks = [];
  if (SMOKE_ALL_MODELS) {
    for (const chatGptModel of CHATGPT_MODELS) {
      const result = await chat('只回答两个字：通过', { chatGptModel });
      assertReply(chatGptModel, result, '通过');
      modelChecks.push({ chatGptModel, ...result });
    }
  }

  const steadyPass = (warm2.firstDeltaMs ?? Infinity) <= MAX_FIRST_MS;
  const recoveryPass = [recover, ...modelChecks]
    .every(result => (result.firstDeltaMs ?? Infinity) <= MAX_RECOVERY_FIRST_MS);
  const pass = steadyPass && recoveryPass;
  const summary = {
    mode: DESKTOP ? 'desktop' : 'local',
    maxFirstMs: MAX_FIRST_MS,
    maxRecoveryFirstMs: MAX_RECOVERY_FIRST_MS,
    allModels: SMOKE_ALL_MODELS,
    health,
    warm1,
    warm2,
    abort,
    recover,
    modelChecks,
    steadyPass,
    recoveryPass,
    pass,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!pass) {
    throw new Error(
      `First delta too slow: steady max ${MAX_FIRST_MS}ms, recovery max ${MAX_RECOVERY_FIRST_MS}ms`,
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  if (startedDesktopServer) stopLocalServer();
});
