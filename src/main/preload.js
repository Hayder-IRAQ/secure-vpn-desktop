const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vpnAPI', {
  // VPN Control
  connect: (server) => ipcRenderer.invoke('vpn:connect', server),
  disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  changeServer: (server) => ipcRenderer.invoke('vpn:change-server', server),
  getState: () => ipcRenderer.invoke('vpn:get-state'),

  // Listen for state changes from main process
  onStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('vpn-state-changed', handler);
    return () => ipcRenderer.removeListener('vpn-state-changed', handler);
  },

  // Servers
  getServers: () => ipcRenderer.invoke('servers:get'),
  setServers: (servers) => ipcRenderer.invoke('servers:set', servers),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // Store
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),

  // App
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkEngines: () => ipcRenderer.invoke('app:check-engines'),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
});
