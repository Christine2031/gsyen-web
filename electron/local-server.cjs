const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

let serverProcess = null;
let serverPort = null;
let serverReadyPromise = null;
let appRef = null;
let stopping = false;
let restartTimer = null;
let restartAttempts = 0;
const bridgeToken = process.env.LOCAL_BRIDGE_TOKEN || randomBytes(32).toString('base64url');

function isReady(port, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/api/codex/health',
      headers: { 'X-GSYEN-Bridge-Token': bridgeToken },
    }, res => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitUntilReady(port) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await isReady(port, 1000)) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

function waitForChildPort(child, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
    };
    const onMessage = message => {
      const port = Number(message?.port);
      if (message?.type !== 'gsyen-api-ready' || !Number.isInteger(port) || port < 1 || port > 65535) return;
      cleanup();
      resolve(port);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onExit = () => {
      cleanup();
      reject(new Error('Local API exited before announcing its port'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Local API did not announce its port'));
    }, timeoutMs);
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function warmChatGptBridge(port) {
  const req = http.get({
    hostname: '127.0.0.1',
    port,
    path: '/api/codex/health',
    headers: { 'X-GSYEN-Bridge-Token': bridgeToken },
  }, res => res.resume());
  req.setTimeout(1800, () => req.destroy());
  req.on('error', () => {});
}

function clearRestartTimer() {
  if (!restartTimer) return;
  clearTimeout(restartTimer);
  restartTimer = null;
}

function scheduleRestart() {
  if (stopping || !appRef?.isPackaged || restartTimer) return;
  const restartDelay = Math.min(1000 * 2 ** restartAttempts, 15000);
  restartAttempts += 1;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startLocalServer(appRef).catch(error => console.error('local server restart failed:', error));
  }, restartDelay);
}

async function startLocalServer(app) {
  appRef = app ?? appRef;
  if (!appRef?.isPackaged) return;
  if (serverProcess) return serverReadyPromise;
  stopping = false;

  const serverPath = path.join(__dirname, '../dist/server.cjs');
  if (!fs.existsSync(serverPath)) {
    console.error('local API server missing:', serverPath);
    return;
  }

  const spawned = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      API_ONLY: 'true',
      NODE_ENV: 'production',
      NO_COLOR: '1',
      PORT: '0',
      LOCAL_BRIDGE_TOKEN: bridgeToken,
    },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  serverProcess = spawned;
  spawned.on('exit', () => {
    if (serverProcess !== spawned) return;
    serverProcess = null;
    serverPort = null;
    serverReadyPromise = null;
    scheduleRestart();
  });

  serverReadyPromise = (async () => {
    const port = await waitForChildPort(spawned);
    if (serverProcess !== spawned) throw new Error('Local API process changed during startup');
    serverPort = port;
    if (!(await waitUntilReady(port))) throw new Error('Local API did not become ready');
    restartAttempts = 0;
    warmChatGptBridge(port);
  })().catch(error => {
    console.error('local API server startup failed:', error);
    if (serverProcess === spawned) {
      serverPort = null;
      spawned.kill();
    }
    throw error;
  });

  return serverReadyPromise;
}

function stopLocalServer() {
  stopping = true;
  clearRestartTimer();
  const current = serverProcess;
  serverProcess = null;
  serverPort = null;
  serverReadyPromise = null;
  current?.kill();
}

function getLocalBridgeToken() {
  return bridgeToken;
}

async function getLocalBridgeConfig() {
  if (appRef?.isPackaged && serverReadyPromise) {
    await serverReadyPromise.catch(() => {});
  }
  const port = appRef?.isPackaged ? serverPort : 3000;
  return {
    base: port ? `http://127.0.0.1:${port}` : '',
    token: bridgeToken,
  };
}

module.exports = {
  startLocalServer,
  stopLocalServer,
  getLocalBridgeToken,
  getLocalBridgeConfig,
};
