/**
 * ipc-library-fs — Canvas Library 文件系统 IPC handlers
 * 注册 fs:showOpenDialog / fs:readDir / fs:readFile / fs:writeFile
 */
const { dialog } = require('electron');
const fs   = require('fs');
const path = require('path');

module.exports = function registerLibraryFsHandlers(ipcMain) {
  ipcMain.handle('fs:showOpenDialog', async (_e, opts) => dialog.showOpenDialog(opts));

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
