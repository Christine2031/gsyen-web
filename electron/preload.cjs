const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  canvas: {
    readAll: ()          => ipcRenderer.invoke('canvas:readAll'),
    write:   (id, data)  => ipcRenderer.invoke('canvas:write', id, data),
    delete:  (id)        => ipcRenderer.invoke('canvas:delete', id),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close'),
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
  getAppPath: () => ipcRenderer.invoke('app:getPath'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  isElectron: true,
  platform: process.platform,
});
