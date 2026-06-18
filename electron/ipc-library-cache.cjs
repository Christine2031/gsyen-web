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
    // Phase 1: withFileTypes 一次调用拿 isDirectory，无需 statSync（大文件夹快很多）
    const dirents = fs.readdirSync(folderPath, { withFileTypes: true });
    const raw = dirents
      .filter(d => !d.name.startsWith('.') && !d.name.startsWith('$'))
      .map(d => ({ name: d.name, lastModified: 0, isDir: d.isDirectory(), preview: '' }));

    _cache.set(folderPath, raw);
    onUpdate(folderPath, raw);   // 立刻推给渲染层，先显示列表

    // Phase 2: 补 mtime + 预览（只针对文本文件，分批避免卡主进程）
    const textFiles = raw.filter(e => !e.isDir && /\.(md|txt)$/i.test(e.name));
    for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
      const batch = textFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(e =>
        new Promise(resolve => {
          setImmediate(() => {
            try {
              const fp = path.join(folderPath, e.name);
              e.lastModified = fs.statSync(fp).mtimeMs;
              e.preview = _readPreviewSync(fp);
            } catch {}
            resolve();
          });
        })
      ));
      onUpdate(folderPath, raw);
    }

    // Phase 3: 补其余文件的 mtime，用于排序（excalidraw/canvas/图片/Office）
    const otherFiles = raw.filter(e => !e.isDir && /\.(excalidraw|canvas|jpg|jpeg|png|gif|webp|bmp|svg|docx|xlsx|pptx)$/i.test(e.name));
    for (const e of otherFiles) {
      try { e.lastModified = fs.statSync(path.join(folderPath, e.name)).mtimeMs; } catch {}
    }
    if (otherFiles.length > 0) onUpdate(folderPath, raw);

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
