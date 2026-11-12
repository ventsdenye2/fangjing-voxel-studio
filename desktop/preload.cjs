const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  onHelp: listener => {
    const handler = () => listener();
    ipcRenderer.on('desktop:show-help', handler);
    return () => ipcRenderer.removeListener('desktop:show-help', handler);
  },
  getSettings: () => ipcRenderer.invoke('desktop:settings'),
  setResourceLimits: limits => ipcRenderer.invoke('desktop:set-resource-limits', limits),
  checkBinvox: () => ipcRenderer.invoke('desktop:check-binvox'),
  chooseBinvox: () => ipcRenderer.invoke('desktop:choose-binvox'),
  convert: request => ipcRenderer.invoke('desktop:convert', request),
  cancelConversion: () => ipcRenderer.invoke('desktop:cancel'),
  saveFile: (name, data) => ipcRenderer.invoke('desktop:save', name, data),
  openProject: () => ipcRenderer.invoke('desktop:open')
}));
