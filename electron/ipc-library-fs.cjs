/**
 * ipc-library-fs — Canvas Library 菜单 + 文件系统 IPC handlers
 * 注册 library:showMenu / fs:showOpenDialog / fs:readDir / fs:readFile / fs:writeFile
 */
const { app, dialog, BrowserWindow, Menu, shell } = require('electron');
const fs        = require('fs');
const path      = require('path');
const libCache  = require('./ipc-library-cache.cjs');
const { getPathCapabilities } = require('./path-capabilities.cjs');
const {
  readFileTextBounded,
  readFileBase64Bounded,
} = require('./bounded-file-read.cjs');
const { renamePathNoReplace } = require('./safe-rename.cjs');


let _watcher    = null;
let _watchTimer = null;

module.exports = function registerLibraryFsHandlers(ipcMain) {
  const capabilities = getPathCapabilities(app);
  const approved = value => capabilities.requireAllowed(value);
  const listable = value => capabilities.requireListableDirectory(value);

  function readAllowedEntries(folder) {
    const allowedFiles = capabilities.listAllowedFiles(folder);
    const names = allowedFiles
      ? allowedFiles.map(file => path.basename(file))
      : fs.readdirSync(folder);
    return names.map(name => {
      try {
        const st = fs.statSync(path.join(folder, name));
        return { name, lastModified: st.mtimeMs, isDir: st.isDirectory() };
      } catch { return null; }
    }).filter(Boolean);
  }

  // ── 缓存层：启动时批量扫描，之后从缓存读 ──────────────────────────────────

  ipcMain.handle('library:scanAll', (e, paths) => {
    const sender = e.sender;
    for (const p of (paths ?? [])) {
      let folder;
      try { folder = listable(p); } catch { continue; }
      if (!capabilities.isDirectoryAllowed(folder)) {
        if (!sender.isDestroyed()) {
          sender.send('library:cache-update', {
            folderPath: folder,
            entries: readAllowedEntries(folder),
          });
        }
        continue;
      }
      libCache.startScan(folder, (folderPath, entries) => {
        if (!sender.isDestroyed())
          sender.send('library:cache-update', { folderPath, entries });
      });
    }
  });

  ipcMain.handle('library:readDir', (e, folderPath) => {
    let folder;
    try { folder = listable(folderPath); } catch { return null; }
    if (!capabilities.isDirectoryAllowed(folder)) return readAllowedEntries(folder);
    const cached = libCache.getCache(folder);
    if (cached) return cached;
    const sender = e.sender;
    libCache.startScan(folder, (fp, entries) => {
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
      const folder = listable(folderPath);
      _watcher = fs.watch(folder, { recursive: false }, () => {
        clearTimeout(_watchTimer);
        _watchTimer = setTimeout(() => {
          if (!event.sender.isDestroyed()) event.sender.send('library:folderChanged', folder);
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
    const safeOpts = {
      properties: Array.isArray(opts?.properties)
        ? opts.properties.filter(p => ['openFile', 'openDirectory', 'multiSelections'].includes(p))
        : ['openFile'],
      ...(Array.isArray(opts?.filters) ? { filters: opts.filters } : {}),
    };
    const result = win
      ? await dialog.showOpenDialog(win, safeOpts)
      : await dialog.showOpenDialog(safeOpts);
    if (!result.canceled) {
      capabilities.grantDialogSelection(result.filePaths, safeOpts.properties);
    }
    return result;
  });

  ipcMain.handle('fs:readDir', (_e, dirPath) => {
    try {
      const dir = listable(dirPath);
      return readAllowedEntries(dir);
    } catch { return []; }
  });

  ipcMain.handle('fs:readFile', async (_e, filePath) => {
    try { return await readFileTextBounded(approved(filePath)); } catch { return ''; }
  });

  ipcMain.handle('fs:writeFile', (_e, filePath, text) => {
    try { fs.writeFileSync(approved(filePath), String(text), 'utf8'); return true; } catch { return false; }
  });

  ipcMain.handle('fs:readFileBuffer', async (_e, filePath) => {
    try { return await readFileBase64Bounded(approved(filePath)); } catch { return ''; }
  });

  ipcMain.handle('fs:writeFileBuffer', (_e, filePath, base64) => {
    try {
      fs.writeFileSync(approved(filePath), Buffer.from(String(base64), 'base64'));
      return true;
    } catch { return false; }
  });

  // 移到废纸篓（文件 + 目录均支持）
  ipcMain.handle('library:delete', async (_e, filePath) => {
    try {
      await shell.trashItem(approved(filePath));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });

  // 在 Finder/Explorer 中显示
  ipcMain.handle('library:showInExplorer', (_e, filePath) => {
    try { shell.showItemInFolder(approved(filePath)); return true; } catch { return false; }
  });

  // 重命名（文件 + 目录均支持）
  ipcMain.handle('library:rename', (_e, oldPath, newName) => {
    try {
      if (typeof newName !== 'string' || path.basename(newName) !== newName || !newName.trim()) {
        return { ok: false, error: 'invalid name' };
      }
      const source = approved(oldPath);
      const newPath = capabilities.resolveRenameTarget(
        source,
        path.join(path.dirname(source), newName),
      );
      renamePathNoReplace(source, newPath);
      capabilities.commitRename(source, newPath);
      return { ok: true, newPath };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
};
