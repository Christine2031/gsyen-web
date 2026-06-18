/**
 * ipc-library-fs — Canvas Library 菜单 + 文件系统 IPC handlers
 * 注册 library:showMenu / fs:showOpenDialog / fs:readDir / fs:readFile / fs:writeFile
 */
const { dialog, BrowserWindow, Menu } = require('electron');
const fs        = require('fs');
const path      = require('path');
const libCache  = require('./ipc-library-cache.cjs');

module.exports = function registerLibraryFsHandlers(ipcMain) {

  // ── 缓存层：启动时批量扫描，之后从缓存读 ──────────────────────────────────

  // 渲染层启动后调一次，把已存 localStorage 的所有路径传进来
  ipcMain.handle('library:scanAll', (e, paths) => {
    const sender = e.sender;
    for (const p of (paths ?? [])) {
      libCache.startScan(p, (folderPath, entries) => {
        if (!sender.isDestroyed())
          sender.send('library:cache-update', { folderPath, entries });
      });
    }
  });

  // 读某个文件夹：有缓存立刻返回，无缓存触发扫描并返回 null（渲染层监听 cache-update）
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
};
