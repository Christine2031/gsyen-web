const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { parseKey } = require('./v2ray-parse.cjs');

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

// 用户粘贴的密钥存这里（可写、持久、跨重启）
function userNodesPath() {
  return path.join(appRef.getPath('userData'), 'v2ray-nodes.json');
}

// 订阅 URL 持久化（记住用户填的地址，供 UI 回显）
function subUrlPath() {
  return path.join(appRef.getPath('userData'), 'v2ray-sub-url.txt');
}

function loadNodes() {
  // 优先用户粘贴的密钥；否则回退到打包/开发目录里的默认节点
  const userP = userNodesPath();
  const base  = appRef.isPackaged ? process.resourcesPath : __dirname;
  const p = fs.existsSync(userP) ? userP : path.join(base, 'v2ray-nodes.json');
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
        // 精简 IP 库（geoip-only-cn-private.dat，224KB），省去 23MB 全球库
        { type: 'field', ip:     ['ext:geoip-only-cn-private.dat:private'], outboundTag: 'direct' },
        { type: 'field', domain: ['geosite:cn'],                           outboundTag: 'direct' },
        { type: 'field', ip:     ['ext:geoip-only-cn-private.dat:cn'],      outboundTag: 'direct' },
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

  // 让 v2ray 在 binary 同目录找 geoip/geosite 资源（ext: 引用依赖此路径）
  const assetDir = path.dirname(bin);

  try {
    v2rayProc = spawn(bin, ['run', '-c', cfgPath], {
      stdio: 'ignore',
      detached: false,
      windowsHide: true,
      env: { ...process.env, V2RAY_LOCATION_ASSET: assetDir },
    });
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

// 粘贴军工密钥 → 解析 → 存本地 → 立即连第一条
async function setKey(raw) {
  const nodes = parseKey(raw);
  if (!nodes.length) return { ok: false, error: '密钥无法识别，请检查格式' };

  try {
    fs.writeFileSync(userNodesPath(), JSON.stringify(nodes, null, 2));
  } catch (e) {
    return { ok: false, error: '保存失败：' + e.message };
  }

  stopV2ray();
  await new Promise(r => setTimeout(r, 300));
  activeIndex = 0;
  const ok = launch(nodes[0]);
  return { ok, count: nodes.length, name: nodes[0].name };
}

// 订阅 URL 下发：fetch → base64 decode → 走 setKey 逻辑
async function setSub(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  } catch (e) {
    return { ok: false, error: '无法连接订阅服务器：' + e.message };
  }
  if (!res.ok) return { ok: false, error: `服务器返回 ${res.status}` };

  const text = (await res.text()).trim();

  // 尝试 base64 解码；若解出来不含 vless:// 则当纯文本用
  let raw = text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    if (decoded.includes('vless://') || decoded.includes('vmess://')) raw = decoded;
  } catch {}

  const result = await setKey(raw);
  if (result.ok) {
    // 存 URL，供 UI 回显
    try { fs.writeFileSync(subUrlPath(), url); } catch {}
  }
  return result;
}

function getSubUrl() {
  try {
    const p = subUrlPath();
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null;
  } catch { return null; }
}

module.exports = { startV2ray, stopV2ray, switchNode, getNodes, getStatus, setKey, setSub, getSubUrl };
