const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.send('settings:save', data),
  reportState: (state) => ipcRenderer.send('engine:state', state),
  setLang: (lang) => ipcRenderer.send('app:lang', lang),
  appInfo: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.send('app:quit'),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),
  isVisible: () => ipcRenderer.invoke('ui:visible'),
  onResume: (cb) => ipcRenderer.on('power-resume', () => cb()),
  onVisibility: (cb) => ipcRenderer.on('ui-visible', (_e, v) => cb(!!v)),
  onToggleRunning: (cb) => ipcRenderer.on('toggle-running', () => cb()),
});
