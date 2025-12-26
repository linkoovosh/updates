import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose some Electron APIs to the renderer process
contextBridge.exposeInMainWorld('electron', {
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
  receive: (channel: string, func: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args) => func(...args));
  },
  // Clipboard API
  writeToClipboard: (text: string) => {
    ipcRenderer.send('copy-to-clipboard', text);
  },
  // Screen Share API
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  getCurrentWindowSourceId: () => ipcRenderer.invoke('get-current-window-source-id'),
  // Log Upload API
  uploadClientLog: (data: { filename: string; content: string }) => ipcRenderer.invoke('upload-client-log', data),
  // Settings API
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  
  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', (_event, isMaximized) => callback(isMaximized));
  },

  // DevTools Security
  unlockDevTools: () => ipcRenderer.send('UNLOCK_DEV_TOOLS'),
  lockDevTools: () => ipcRenderer.send('LOCK_DEV_TOOLS'),
  openDevTools: () => ipcRenderer.send('OPEN_DEV_TOOLS'),
});

// Example: Listen for messages from the main process
ipcRenderer.on('main-process-message', (_event: IpcRendererEvent, ...args: unknown[]) => {
  console.log('[Receive Main-process message]:', ...args);
});
