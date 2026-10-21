const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.send('settings:save', data),
  reportState: (state) => ipcRenderer.send('engine:state', state),
  setLang: (lang) => ipcRenderer.send('app:lang', lang),
  appInfo: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.send('app:quit'),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),
  onToggleRunning: (cb) => ipcRenderer.on('toggle-running', () => cb()),
});
