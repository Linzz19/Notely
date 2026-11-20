const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluentDesktop', {
  isElectron: true,
  platform: process.platform,
  globalShortcut: 'Ctrl+Shift+Space',

  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: (jsonString) => ipcRenderer.invoke('workspace:save', jsonString),
  getWorkspacePath: () => ipcRenderer.invoke('workspace:getPath'),
  openDataFolder: () => ipcRenderer.invoke('workspace:openFolder'),

  writeClipboard: (payload) => ipcRenderer.invoke('clipboard:write', payload),
  syncTheme: (theme) => ipcRenderer.invoke('theme:sync', theme),

  exportBackupDialog: (defaultFilename, jsonString) =>
    ipcRenderer.invoke('backup:export', defaultFilename, jsonString),
  importBackupDialog: () => ipcRenderer.invoke('backup:import'),

  onOpenQuickJump: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:open-quick-jump', listener);
    return () => {
      ipcRenderer.removeListener('desktop:open-quick-jump', listener);
    };
  },
});
