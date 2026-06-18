/**
 * ipc-library-fs — Canvas Library 菜单 + 文件系统 IPC handlers
 * 注册 library:showMenu / fs:showOpenDialog / fs:readDir / fs:readFile / fs:writeFile
 */
const { dialog, BrowserWindow, Menu, shell } = require('electron');
const fs        = require('fs');
const path      = require('path');
const libCache  = require('./ipc-library-cache.cjs');


let _watcher    = null;
let _watchTimer = null;

module.exports = function registerLibraryFsHandlers(ipcMain) {

  // ── 缓存层：启动时批量扫描，之后从缓存读 ──────────────────────────────────

  ipcMain.handle('library:scanAll', (e, paths) => {
    const sender = e.sender;
    for (const p of (paths ?? [])) {
      libCache.startScan(p, (folderPath, entries) => {
        if (!sender.isDestroyed())
          sender.send('library:cache-update', { folderPath, entries });
      });
    }
  });

  ipcMain.handle('library:readDir', (e, folderPath) => {
    const cached = libCache.getCache(folderPath);
    if (cached) return cached;
    const sender = e.sender;
    libCache.startScan(folderPath, (fp, entries) => {
      if (!sender.isDestroyed())
        sender.send('library:cache-update', { folderPath: fp, entries });
    });
    return null;
  });

  // ── fs.watch：监听当前选中文件夹，有变化推事件到渲染层 ─────────────────────
  ipcMain.on('library:watchFolder', (event, folderPath) => {
    if (_watcher) { _watcher.close(); _watcher = null; }
    if (!folderPath) return;
    try {
      _watcher = fs.watch(folderPath, { recursive: false }, () => {
        clearTimeout(_watchTimer);
        _watchTimer = setTimeout(() => {
          if (!event.sender.isDestroyed()) event.sender.send('library:folderChanged', folderPath);
        }, 300);
      });
      _watcher.on('error', () => { _watcher = null; });
    } catch {}
  });

  ipcMain.on('library:unwatchFolder', () => {
    if (_watcher) { _watcher.close(); _watcher = null; }
  });

  ipcMain.on('library:showMenu', (event, pos) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const b = win.getBounds();
    // pos 是渲染层传来的按钮相对视口坐标，转换为屏幕坐标
    const x = b.x + (pos?.x ?? 0);
    const y = b.y + (pos?.y ?? b.height);
    const send = (action) => { if (!event.sender.isDestroyed()) event.sender.send('library:menuResult', action); };
    Menu.buildFromTemplate([
      { label: 'Add files to the Library',  click: () => send('files')  },
      { label: 'Add folder to the Library', click: () => send('folder') },
    ]).popup({ window: win, x, y });
  });


  ipcMain.handle('fs:showOpenDialog', async (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts);
  });

  ipcMain.handle('fs:readDir', (_e, dirPath) => {
    try {
      return fs.readdirSync(dirPath).map(name => {
        try {
          const st = fs.statSync(path.join(dirPath, name));
          return { name, lastModified: st.mtimeMs, isDir: st.isDirectory() };
        } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  });

  ipcMain.handle('fs:readFile', (_e, filePath) => {
    try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
  });

  ipcMain.handle('fs:writeFile', (_e, filePath, text) => {
    try { fs.writeFileSync(filePath, text, 'utf8'); return true; } catch { return false; }
  });

  // 移到废纸篓（文件 + 目录均支持）
  ipcMain.handle('library:delete', async (_e, filePath) => {
    try {
      if (!path.isAbsolute(filePath)) return { ok: false, error: 'not absolute path' };
      await shell.trashItem(filePath);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  // 在 Finder/Explorer 中显示
  ipcMain.handle('library:showInExplorer', (_e, filePath) => {
    try { shell.showItemInFolder(filePath); return true; } catch { return false; }
  });

  // 重命名（文件 + 目录均支持）
  ipcMain.handle('library:rename', (_e, oldPath, newName) => {
    try {
      const newPath = path.join(path.dirname(oldPath), newName);
      fs.renameSync(oldPath, newPath);
      return { ok: true, newPath };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
};
