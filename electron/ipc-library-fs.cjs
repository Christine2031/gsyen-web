/**
 * ipc-library-fs — Canvas Library 菜单 + 文件系统 IPC handlers
 * 注册 library:showMenu / fs:showOpenDialog / fs:readDir / fs:readFile / fs:writeFile
 */
const { dialog, BrowserWindow, Menu } = require('electron');
const fs   = require('fs');
const path = require('path');

let _watcher    = null;
let _watchTimer = null;

module.exports = function registerLibraryFsHandlers(ipcMain) {

  // ── fs.watch：监听当前选中文件夹，有变化推事件到渲染层 ─────────────────────
  ipcMain.on('library:watchFolder', (event, folderPath) => {
    if (_watcher) { _watcher.close(); _watcher = null; }
    if (!folderPath) return;
    try {
      _watcher = fs.watch(folderPath, { recursive: false }, () => {
        clearTimeout(_watchTimer);
        _watchTimer = setTimeout(() => {
          if (!event.sender.isDestroyed()) event.sender.send('library:folderChanged', folderPath);
        }, 300); // 300ms debounce 防止重复触发
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

  ipcMain.handle('fs:deleteEntry', (_e, entryPath) => {
    try { fs.rmSync(entryPath, { recursive: true, force: true }); return true; } catch { return false; }
  });
};
