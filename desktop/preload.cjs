const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  onHelp: listener => {
    const handler = () => listener();
    ipcRenderer.on('desktop:show-help', handler);
    return () => ipcRenderer.removeListener('desktop:show-help', handler);
  },
  onProjectAvailable: listener => {
    const handler = () => listener();
    ipcRenderer.on('desktop:project-available', handler);
    return () => ipcRenderer.removeListener('desktop:project-available', handler);
  },
  takePendingProject: () => ipcRenderer.invoke('desktop:take-pending-project'),
  getUpdateState: () => ipcRenderer.invoke('desktop:update-state'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('desktop:update-download'),
  installUpdate: () => ipcRenderer.invoke('desktop:update-install'),
  openUpdateDownloads: () => ipcRenderer.invoke('desktop:update-downloads'),
  onUpdateState: listener => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('desktop:update-state', handler);
    return () => ipcRenderer.removeListener('desktop:update-state', handler);
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
