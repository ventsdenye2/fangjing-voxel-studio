const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  getSettings: () => ipcRenderer.invoke('desktop:settings'),
  checkBinvox: () => ipcRenderer.invoke('desktop:check-binvox'),
  chooseBinvox: () => ipcRenderer.invoke('desktop:choose-binvox'),
  convert: request => ipcRenderer.invoke('desktop:convert', request),
  cancelConversion: () => ipcRenderer.invoke('desktop:cancel'),
  saveFile: (name, data) => ipcRenderer.invoke('desktop:save', name, data),
  openProject: () => ipcRenderer.invoke('desktop:open')
}));
