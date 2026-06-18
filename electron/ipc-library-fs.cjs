/**
 * ipc-library-fs — Canvas Library 菜单 + 文件系统 IPC handlers
 * 注册 library:showMenu / fs:showOpenDialog / fs:readDir / fs:readFile / fs:writeFile
 */
const { dialog, BrowserWindow, Menu } = require('electron');
const fs   = require('fs');
const path = require('path');

module.exports = function registerLibraryFsHandlers(ipcMain) {
  ipcMain.on('library:showMenu', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const b = win.getBounds();
    const x = b.x;
    const y = b.y + b.height;
    console.log('[library:showMenu] getBounds:', b, '→ popup at x:', x, 'y:', y);
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
