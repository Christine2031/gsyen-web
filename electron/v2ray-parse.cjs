// 军工密钥解析：把粘贴的内容解析成节点数组
// 支持：单/多条 vless:// 链接（换行分隔）、base64 订阅内容
// 以后要加自定义格式，往 parseKey 里加分支即可

const CN_NAMES = ['穹弯·甲', '穹弯·乙', '穹弯·丙', '穹弯·丁', '穹弯·戊', '穹弯·己'];

function parseVless(line) {
  // vless://uuid@host:port?query#name
  if (!line.startsWith('vless://')) return null;
  let u;
  try { u = new URL(line); } catch { return null; }

  const uuid = decodeURIComponent(u.username || '');
  const address = u.hostname;
  const port = Number(u.port) || 443;
  if (!uuid || !address) return null;

  const q = u.searchParams;
  const name = u.hash ? decodeURIComponent(u.hash.slice(1)) : '';

  return {
    name,
    address,
    port,
    uuid,
    flow:        q.get('flow')     || 'xtls-rprx-vision',
    serverName:  q.get('sni')      || q.get('serverName') || '',
    fingerprint: q.get('fp')       || 'chrome',
    publicKey:   q.get('pbk')      || '',
    shortId:     q.get('sid')      || '',
  };
}

function maybeBase64Decode(text) {
  // 订阅常把多条链接 base64 打包；含 vless:// 说明是明文，直接返回
  if (text.includes('vless://')) return text;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) return text;
  try {
    const decoded = Buffer.from(text.replace(/\s/g, ''), 'base64').toString('utf8');
    return decoded.includes('vless://') ? decoded : text;
  } catch { return text; }
}

/** 解析密钥文本 → 节点数组（解析失败返回 []） */
function parseKey(raw) {
  const text = maybeBase64Decode((raw || '').trim());
  const nodes = text
    .split(/[\r\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(parseVless)
    .filter(Boolean);

  // 补默认中文名（密钥里没带 # 名称时）
  return nodes.map((n, i) => ({ ...n, name: n.name || CN_NAMES[i] || `穹弯·${i + 1}` }));
}

module.exports = { parseKey };
