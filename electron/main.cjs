const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const Sentry = require('@sentry/electron/main');
const path = require('path');
const fs   = require('fs');

Sentry.init({
  dsn: 'https://a7b7176417e2f24b54156ef4ff01e8b2@o4511541959720960.ingest.us.sentry.io/4511541969551360',
});

app.setAppUserModelId('com.gsyen.app');

const isDev = !app.isPackaged;
const CANVAS_DIR = path.join(app.getPath('userData'), 'canvas');

let win  = null;
let tray = null;
let forceQuit = false;

// ── 系统托盘 ──────────────────────────────────────────────────────────────────

function createTray() {
  // dev: public/icon.ico；prod: extraResources 放到 asar 外的 resources/icon.ico
  const iconPath = isDev
    ? path.join(__dirname, '../public/icon.ico')
    : path.join(process.resourcesPath, 'icon.ico');

  let icon;
  try {
    const raw = nativeImage.createFromPath(iconPath);
    icon = raw.isEmpty() ? null : raw.resize({ width: 16, height: 16 });
  } catch {
    icon = null;
  }

  // Windows 托盘必须有有效图标，没有就跳过
  if (!icon || icon.isEmpty()) return;

  tray = new Tray(icon);
  tray.setToolTip('GSYEN');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show GSYEN',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        forceQuit = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);

  // 双击恢复窗口
  tray.on('double-click', () => showWindow());
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ── 自动更新 ──────────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.autoDownload         = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available',    info     => win?.webContents.send('updater:available',     info));
  autoUpdater.on('update-not-available',()       => win?.webContents.send('updater:not-available'));
  autoUpdater.on('download-progress',   progress => win?.webContents.send('updater:progress',      progress));
  autoUpdater.on('update-downloaded',   info     => win?.webContents.send('updater:downloaded',    info));
  autoUpdater.on('error',               err      => win?.webContents.send('updater:error',         err?.message ?? String(err)));

  // 启动 5 秒后检查，捕获网络/配置错误防止主进程崩溃
  setTimeout(() => autoUpdater.checkForUpdates().catch(err => {
    console.error('[updater] checkForUpdates failed:', err?.message ?? err);
    win?.webContents.send('updater:error', err?.message ?? String(err));
  }), 5000);
}

ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall(false, true));
ipcMain.handle('updater:check',   () => autoUpdater.checkForUpdates());

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

ipcMain.handle('app:getPath',    () => app.getPath('userData'));
ipcMain.handle('app:getVersion', () => app.getVersion());

// ── 窗口控制 IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle('window:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.handle('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

// ── 窗口 ──────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F9F8F6',
    icon: path.join(__dirname, '../public/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 10 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
    setupAutoUpdater();
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭窗口 → 最小化到托盘，不退出
  win.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => { win = null; });
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  try { createTray(); } catch (e) { console.error('tray init failed:', e); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  // Windows/Linux：窗口全关也不退出（托盘常驻）
  // 只有 forceQuit（托盘菜单 Quit）才真正退出
  if (process.platform === 'darwin' && !forceQuit) return;
  if (!forceQuit) return;
  app.quit();
});

app.on('before-quit', () => { forceQuit = true; });
