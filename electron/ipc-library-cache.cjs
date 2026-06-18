/**
 * ipc-library-cache — 主进程文件夹缓存 + fs.watch
 * 冷启动时后台扫描所有 Library 文件夹，预览读完一批推一次事件到渲染层。
 * 之后 fs.watch 监听变化，增量更新，渲染层永远从缓存拿数据。
 */
const fs   = require('fs');
const path = require('path');

// cache: folderPath → [{ name, lastModified, isDir, preview }]
const _cache    = new Map();
const _watchers = new Map();
const _scanning = new Set();

const PREVIEW_BYTES   = 512;
const BATCH_SIZE      = 5;   // 每批并发读预览的文件数

function _readPreviewSync(filePath) {
  try {
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(PREVIEW_BYTES);
    const n   = fs.readSync(fd, buf, 0, PREVIEW_BYTES, 0);
    fs.closeSync(fd);
    const text = buf.slice(0, n).toString('utf8');
    return text.split('\n')
      .map(l => l.replace(/^[#>\s*\-–—]+/, '').trim())
      .find(l => l.length > 2)
      ?.slice(0, 80) ?? '';
  } catch { return ''; }
}

async function _scanFolder(folderPath, onUpdate) {
  if (_scanning.has(folderPath)) return;
  _scanning.add(folderPath);

  try {
    // Phase 1: 读目录元数据（sync，极快）
    const raw = fs.readdirSync(folderPath).map(name => {
      try {
        const st = fs.statSync(path.join(folderPath, name));
        return { name, lastModified: st.mtimeMs, isDir: st.isDirectory(), preview: '' };
      } catch { return null; }
    }).filter(Boolean);

    _cache.set(folderPath, raw);
    onUpdate(folderPath, raw);   // 立刻把文件列表推给渲染层

    // Phase 2: 分批读预览（限并发，不打满 CPU）
    const textFiles = raw.filter(e => !e.isDir && /\.(md|txt)$/i.test(e.name));
    for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
      const batch = textFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(e =>
        new Promise(resolve => {
          // setImmediate 让 Electron 主循环有机会响应其他 IPC
          setImmediate(() => {
            e.preview = _readPreviewSync(path.join(folderPath, e.name));
            resolve();
          });
        })
      ));
      onUpdate(folderPath, raw); // 每批完成推一次更新
    }
  } catch (err) {
    console.error('[library-cache] scan failed:', folderPath, err?.message);
  } finally {
    _scanning.delete(folderPath);
  }
}

function _watchFolder(folderPath, onUpdate) {
  if (_watchers.has(folderPath)) return;
  try {
    let debounce = null;
    const w = fs.watch(folderPath, { persistent: false }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => _scanFolder(folderPath, onUpdate), 600);
    });
    _watchers.set(folderPath, w);
  } catch { /* 无权限或路径不存在 */ }
}

// ── 公开 API ─────────────────────────────────────────────────────────────────

module.exports = {
  /** 返回缓存，null = 尚未扫描 */
  getCache: (folderPath) => _cache.get(folderPath) ?? null,

  /** 启动扫描 + 开启 watcher，onUpdate(folderPath, entries) 会多次回调 */
  startScan(folderPath, onUpdate) {
    _watchFolder(folderPath, onUpdate);
    _scanFolder(folderPath, onUpdate);
  },

  /** 停止监听某个文件夹 */
  stopWatch(folderPath) {
    const w = _watchers.get(folderPath);
    if (w) { w.close(); _watchers.delete(folderPath); }
    _cache.delete(folderPath);
  },

  /** 关闭所有 watcher（app 退出时调用）*/
  stopAll() {
    for (const w of _watchers.values()) w.close();
    _watchers.clear();
  },
};
