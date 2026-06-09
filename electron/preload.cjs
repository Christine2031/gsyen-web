const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  canvas: {
    readAll: ()          => ipcRenderer.invoke('canvas:readAll'),
    write:   (id, data)  => ipcRenderer.invoke('canvas:write', id, data),
    delete:  (id)        => ipcRenderer.invoke('canvas:delete', id),
  },
  getAppPath: () => ipcRenderer.invoke('app:getPath'),
  isElectron: true,
});
