const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SOCKS_PORT = 10808;
const HTTP_PORT  = 10809;

let v2rayProc  = null;
let appRef     = null;
let activeIndex = 0;

function getBinPath() {
  const base = appRef.isPackaged ? process.resourcesPath : __dirname;
  const ext  = process.platform === 'win32' ? '.exe' : '';
  return path.join(base, 'v2ray-core', `v2ray${ext}`);
}

function loadNodes() {
  const base = appRef.isPackaged ? process.resourcesPath : __dirname;
  const p = path.join(base, 'v2ray-nodes.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function buildConfig(node) {
  return {
    log: { loglevel: 'warning' },
    inbounds: [
      { port: SOCKS_PORT, protocol: 'socks', settings: { auth: 'noauth', udp: true }, tag: 'socks-in' },
      { port: HTTP_PORT,  protocol: 'http',  settings: {},                            tag: 'http-in'  },
    ],
    outbounds: [
      {
        tag: 'proxy', protocol: 'vless',
        settings: { vnext: [{ address: node.address, port: node.port, users: [{ id: node.uuid, encryption: 'none', flow: node.flow || '' }] }] },
        streamSettings: {
          network: 'tcp', security: 'reality',
          realitySettings: { serverName: node.serverName, fingerprint: node.fingerprint || 'chrome', publicKey: node.publicKey, shortId: node.shortId || '' },
        },
      },
      { tag: 'direct', protocol: 'freedom'   },
      { tag: 'block',  protocol: 'blackhole'  },
    ],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', ip:     ['geoip:private'], outboundTag: 'direct' },
        { type: 'field', domain: ['geosite:cn'],    outboundTag: 'direct' },
        { type: 'field', ip:     ['geoip:cn'],      outboundTag: 'direct' },
      ],
    },
  };
}

function launch(node) {
  const bin = getBinPath();
  if (!fs.existsSync(bin))  { console.warn('[v2ray] binary not found:', bin); return false; }
  if (!node?.address)       { console.warn('[v2ray] node has no address, skipping'); return false; }

  const cfgPath = path.join(appRef.getPath('userData'), 'v2ray-active.json');
  fs.writeFileSync(cfgPath, JSON.stringify(buildConfig(node), null, 2));

  try {
    v2rayProc = spawn(bin, ['run', '-c', cfgPath], { stdio: 'ignore', detached: false, windowsHide: true });
    v2rayProc.on('error', err => console.error('[v2ray] error:', err.message));
    v2rayProc.on('exit',  ()  => { v2rayProc = null; });
    console.log('[v2ray] started pid:', v2rayProc.pid, '→', node.name);
    return true;
  } catch (err) {
    console.error('[v2ray] spawn failed:', err.message);
    return false;
  }
}

function stopV2ray() {
  if (!v2rayProc) return;
  try { v2rayProc.kill(); } catch {}
  v2rayProc = null;
}

function startV2ray(app) {
  appRef = app;
  const nodes = loadNodes();
  if (!nodes.length) { console.warn('[v2ray] no nodes configured'); return; }
  activeIndex = 0;
  launch(nodes[activeIndex]);
}

async function switchNode(index) {
  const nodes = loadNodes();
  if (index < 0 || index >= nodes.length) return { ok: false, error: 'invalid index' };
  const node = nodes[index];
  if (!node.address) return { ok: false, error: 'node not configured' };
  stopV2ray();
  await new Promise(r => setTimeout(r, 500));
  activeIndex = index;
  const ok = launch(node);
  return { ok, name: node.name, index };
}

function getNodes() {
  return loadNodes().map((n, i) => ({
    index:      i,
    name:       n.name,
    address:    n.address || null,
    active:     i === activeIndex,
    configured: !!n.address,
  }));
}

function getStatus() {
  return { running: !!v2rayProc, activeIndex, socksPort: SOCKS_PORT, httpPort: HTTP_PORT };
}

module.exports = { startV2ray, stopV2ray, switchNode, getNodes, getStatus };
