const { app, BrowserWindow, ipcMain, shell, globalShortcut, screen } = require('electron');
const Sentry = require('@sentry/electron/main');
const path = require('path');
const fs   = require('fs');
const { startV2ray, stopV2ray, switchNode, getNodes, getStatus, setKey, setSub, getSubUrl, getGatewayMode, setGatewayMode } = require('./v2ray.cjs');
const { createFullscreenController } = require('./fullscreen.cjs');
const { createTray } = require('./tray.cjs');
const { registerUpdaterIpc, setupAutoUpdater } = require('./updater.cjs');
const { startLocalServer, stopLocalServer, getLocalBridgeConfig } = require('./local-server.cjs');
const { registerGsyenApiCors } = require('./gsyen-api-cors.cjs');

Sentry.init({
  dsn: 'https://a7b7176417e2f24b54156ef4ff01e8b2@o4511541959720960.ingest.us.sentry.io/4511541969551360',
});

app.setAppUserModelId('com.gsyen.app');

const isDev = !app.isPackaged;
const CANVAS_DIR = path.join(app.getPath('userData'), 'canvas');
const CANVAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

let win  = null;
let tray = null;
let forceQuit = false;
const fullscreen = createFullscreenController();

function getWindowIconPath() {
  if (process.platform === 'win32') {
    return isDev
      ? path.join(__dirname, '../public/icon.ico')
      : path.join(process.resourcesPath, 'icon.ico');
  }

  return isDev
    ? path.join(__dirname, '../public/icon.png')
    : path.join(process.resourcesPath, 'icon.ico');
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

registerUpdaterIpc(ipcMain);

// ── v2ray IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('v2ray:getNodes',  ()        => getNodes());
ipcMain.handle('v2ray:getStatus', ()        => getStatus());
ipcMain.handle('v2ray:switch',    (_, i)    => switchNode(i));
ipcMain.handle('v2ray:setKey',    (_, key)  => setKey(key));
ipcMain.handle('v2ray:setSub',          (_, url)  => setSub(url));
ipcMain.handle('v2ray:getSubUrl',       ()        => getSubUrl());
ipcMain.handle('v2ray:getGatewayMode',  ()        => getGatewayMode());
ipcMain.handle('v2ray:setGatewayMode',  (_, mode) => setGatewayMode(mode));

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
  if (typeof id !== 'string' || !CANVAS_ID_PATTERN.test(id)) return false;
  if (!fs.existsSync(CANVAS_DIR)) fs.mkdirSync(CANVAS_DIR, { recursive: true });
  fs.writeFileSync(path.join(CANVAS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle('canvas:delete', (_e, id) => {
  if (typeof id !== 'string' || !CANVAS_ID_PATTERN.test(id)) return false;
  const file = path.join(CANVAS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
});

ipcMain.handle('app:getPath',    () => app.getPath('userData'));
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('bridge:getConfig', () => getLocalBridgeConfig());

// ── Library 文件系统 IPC ──────────────────────────────────────────────────────
require('./ipc-library-fs.cjs')(ipcMain);
require('./ipc-docviewer.cjs')(ipcMain);

// ── 窗口控制 IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle('window:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.handle('window:fullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) fullscreen.toggle(w);
});
ipcMain.handle('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('window:isMaximized',  (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized()  ?? false);
ipcMain.handle('window:isFullscreen', (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false);
ipcMain.handle('window:getPosition', (e) => BrowserWindow.fromWebContents(e.sender)?.getPosition() ?? [0, 0]);
ipcMain.handle('window:setPosition', (e, x, y) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !Number.isFinite(x) || !Number.isFinite(y)) return;
  w.setPosition(Math.round(x), Math.round(y));
});

// ── 窗口 ──────────────────────────────────────────────────────────────────────

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const targetWidth = Math.min(1400, Math.max(980, Math.floor(workAreaSize.width * 0.96)));
  const targetHeight = Math.min(900, Math.max(680, Math.floor(workAreaSize.height * 0.94)));
  const initialWidth = Math.min(targetWidth, workAreaSize.width);
  const initialHeight = Math.min(targetHeight, workAreaSize.height);

  win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: Math.min(900, initialWidth),
    minHeight: Math.min(600, initialHeight),
    backgroundColor: '#F9F8F6',
    icon: getWindowIconPath(),
    frame: process.platform === 'win32' ? false : true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 10 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 正式版补齐 file:// Origin；开发版同时把响应 CORS 收敛到本地 Vite Origin。
  registerGsyenApiCors(win.webContents.session, isDev);

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
    setupAutoUpdater(() => win);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev
      ? url.startsWith('http://127.0.0.1:5173/')
      : url.startsWith('file:');
    if (!allowed) event.preventDefault();
  });

  // 最大化状态变化 → 通知渲染层切换 max/restore 图标
  win.on('maximize',   () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));

  fullscreen.wireMacEvents(win);

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
  startLocalServer(app).catch(e => console.error('local server init failed:', e));
  createWindow();
  try {
    tray = createTray({
      app,
      isDev,
      showWindow,
      onQuit: () => {
        forceQuit = true;
        app.quit();
      },
    });
  } catch (e) { console.error('tray init failed:', e); }
  startV2ray(app);

  // F11 全平台；Mac 另加 Ctrl+Cmd+F（系统惯例）
  globalShortcut.register('F11', () => { if (win) fullscreen.toggle(win); });
  if (process.platform === 'darwin') {
    globalShortcut.register('Ctrl+Command+F', () => { if (win) fullscreen.toggle(win); });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

app.on('window-all-closed', () => {
  // Windows/Linux：窗口全关也不退出（托盘常驻）
  // 只有 forceQuit（托盘菜单 Quit）才真正退出
  if (process.platform === 'darwin' && !forceQuit) return;
  if (!forceQuit) return;
  app.quit();
});

app.on('before-quit', () => {
  forceQuit = true;
  stopV2ray();
  stopLocalServer();
  require('./ipc-library-cache.cjs').stopAll();
});
