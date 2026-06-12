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
    setSub:    (url)   => ipcRenderer.invoke('v2ray:setSub', url),
    getSubUrl: ()      => ipcRenderer.invoke('v2ray:getSubUrl'),
  },
  isElectron: true,
  platform: process.platform,
});
