// Sentry 已在主进程(main.cjs)与渲染层(main.tsx)正确初始化，二者通过
// sentry-ipc:// 自动桥接，preload 无需也不应再 require @sentry/electron/preload：
// 沙箱 preload 加载不了 npm 包，会在第 1 行就崩、导致 electronAPI 永不暴露
// （主页窗口三键消失）。此处只保留 electron 内置模块。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  canvas: {
    readAll: ()          => ipcRenderer.invoke('canvas:readAll'),
    write:   (id, data)  => ipcRenderer.invoke('canvas:write', id, data),
    delete:  (id)        => ipcRenderer.invoke('canvas:delete', id),
  },
  window: {
    minimize:   () => ipcRenderer.invoke('window:minimize'),
    maximize:   () => ipcRenderer.invoke('window:maximize'),
    fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
    close:      () => ipcRenderer.invoke('window:close'),
    isMaximized:  () => ipcRenderer.invoke('window:isMaximized'),
    isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
    onFullscreenState: (fn) => {
      const h = (_e, v) => fn(v);
      ipcRenderer.on('window:fullscreen-state', h);
      return () => ipcRenderer.removeListener('window:fullscreen-state', h);
    },
    // 监听最大化状态变化；返回取消订阅函数（多个组件可独立订阅，互不干扰）
    onMaximized: (fn) => {
      const h = (_e, v) => fn(v);
      ipcRenderer.on('window:maximized', h);
      return () => ipcRenderer.removeListener('window:maximized', h);
    },
  },
  updater: {
    install:  ()       => ipcRenderer.invoke('updater:install'),
    check:    ()       => ipcRenderer.invoke('updater:check'),
    onAvailable:    (fn) => ipcRenderer.on('updater:available',    (_e, i) => fn(i)),
    onProgress:     (fn) => ipcRenderer.on('updater:progress',     (_e, p) => fn(p)),
    onDownloaded:   (fn) => ipcRenderer.on('updater:downloaded',   (_e, i) => fn(i)),
    onError:        (fn) => ipcRenderer.on('updater:error',        (_e, m) => fn(m)),
    onNotAvailable: (fn) => ipcRenderer.on('updater:not-available', () => fn()),
  },
  onFullscreenChange:  (fn) => ipcRenderer.on('fullscreen:change', (_e, d) => fn(d)),
  offFullscreenChange: ()   => ipcRenderer.removeAllListeners('fullscreen:change'),
  getAppPath: () => ipcRenderer.invoke('app:getPath'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  v2ray: {
    getNodes:  ()      => ipcRenderer.invoke('v2ray:getNodes'),
    getStatus: ()      => ipcRenderer.invoke('v2ray:getStatus'),
    switch:    (index) => ipcRenderer.invoke('v2ray:switch', index),
    setKey:    (key)   => ipcRenderer.invoke('v2ray:setKey', key),
    setSub:          (url)  => ipcRenderer.invoke('v2ray:setSub', url),
    getSubUrl:       ()     => ipcRenderer.invoke('v2ray:getSubUrl'),
    getGatewayMode:  ()     => ipcRenderer.invoke('v2ray:getGatewayMode'),
    setGatewayMode:  (mode) => ipcRenderer.invoke('v2ray:setGatewayMode', mode),
  },
  library: {
    showMenu:     (pos)   => ipcRenderer.send('library:showMenu', pos),
    onMenuResult: (fn)    => ipcRenderer.once('library:menuResult', (_e, action) => fn(action)),
    scanAll:      (paths) => ipcRenderer.invoke('library:scanAll', paths),
    readDir:      (p)     => ipcRenderer.invoke('library:readDir', p),
    onCacheUpdate: (fn) => {
      const h = (_e, data) => fn(data);
      ipcRenderer.on('library:cache-update', h);
      return () => ipcRenderer.removeListener('library:cache-update', h);
    },
    delete:         (filePath)         => ipcRenderer.invoke('library:delete',         filePath),
    showInExplorer: (filePath)         => ipcRenderer.invoke('library:showInExplorer', filePath),
    rename:         (oldPath, newName) => ipcRenderer.invoke('library:rename',         oldPath, newName),
  },
  docviewer: {
    checkInstalled: ()         => ipcRenderer.invoke('docviewer:checkInstalled'),
    convert:        (filePath) => ipcRenderer.invoke('docviewer:convert', filePath),
  },
  isElectron: true,
  platform: process.platform,
  showOpenDialog: (opts)           => ipcRenderer.invoke('fs:showOpenDialog', opts),
  readDir:        (dirPath)        => ipcRenderer.invoke('fs:readDir',        dirPath),
  readFile:       (filePath)       => ipcRenderer.invoke('fs:readFile',       filePath),
  writeFile:      (filePath, text) => ipcRenderer.invoke('fs:writeFile',      filePath, text),
});
