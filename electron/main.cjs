const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

const isDev = process.env.NODE_ENV !== 'production';
const CANVAS_DIR = path.join(app.getPath('userData'), 'canvas');

// ── 文件系统 IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('canvas:readAll', () => {
  if (!fs.existsSync(CANVAS_DIR)) return [];
  return fs.readdirSync(CANVAS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(CANVAS_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean);
});

ipcMain.handle('canvas:write', (_e, id, data) => {
  if (!fs.existsSync(CANVAS_DIR)) fs.mkdirSync(CANVAS_DIR, { recursive: true });
  fs.writeFileSync(path.join(CANVAS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle('canvas:delete', (_e, id) => {
  const file = path.join(CANVAS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
});

ipcMain.handle('app:getPath', () => app.getPath('userData'));

// ── 窗口 ──────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1A1A1A',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
