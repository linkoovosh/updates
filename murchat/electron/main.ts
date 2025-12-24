import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { activityService } from './activityService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logging
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true; // IMPORTANT: ENABLE AUTO DOWNLOAD

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST, '../public')
  : path.join(process.env.DIST, 'renderer');

let win: BrowserWindow | null;
let tray: Tray | null = null;
let isQuitting = false;
let allowDevTools = false;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createTray() {
  try {
      const possiblePaths = [
          path.join(process.env.VITE_PUBLIC || '', 'murchat.ico'),
          path.join(process.resourcesPath, 'murchat.ico'),
          path.join(__dirname, '../../murchat.ico'), 
          path.join(__dirname, '../public/murchat.ico')
      ];

      let iconPath = '';
      const fsSync = require('fs');
      for (const p of possiblePaths) {
          if (fsSync.existsSync(p)) {
              iconPath = p;
              break;
          }
      }

      if (!iconPath) return;

      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Открыть MurCHAT', click: () => toggleWindow() },
        { type: 'separator' },
        { label: 'Выход', click: () => {
          isQuitting = true;
          app.quit();
        }}
      ]);

      tray.setToolTip('MurCHAT');
      tray.setContextMenu(contextMenu);
      tray.on('click', toggleWindow);
  } catch (e) {
      log.error("Failed to create tray:", e);
  }
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC || '', 'murchat.ico'), 
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#ffffff',
        height: 48
    },
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'mica',
    resizable: true,
    maximizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      webviewTag: true
    },
    opacity: 0
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    callback({
      responseHeaders: {
        ...responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    });
  });

  win.webContents.on('before-input-event', (event, input) => {
      if (allowDevTools) return;
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') event.preventDefault();
      if (((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') event.preventDefault();
  });

  win.on('close', (event) => {
    if (isCleanExit) return true;
    if (!isQuitting && tray && app.isPackaged) {
      event.preventDefault();
      const fadeOut = async () => {
          if (!win) return;
          for (let i = 1.0; i >= 0; i -= 0.1) {
              try { if (!win || win.isDestroyed()) return; win.setOpacity(i); } catch (e) { return; }
              await new Promise(r => setTimeout(r, 10));
          }
          if (win && !win.isDestroyed()) win.hide();
      };
      fadeOut();
      return false;
    }
    event.preventDefault();
    startGracefulShutdown();
    return false;
  });

  win.on('maximize', () => win?.webContents.send('window-maximized', true));
  win.on('unmaximize', () => win?.webContents.send('window-maximized', false));

  win.once('ready-to-show', async () => {
      if (!win) return;
      win.show();
      win.focus();
      activityService.setWindow(win);
      activityService.start();
      for (let i = 0; i <= 1.0; i += 0.1) {
          win.setOpacity(i);
          await new Promise(r => setTimeout(r, 15));
      }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    if (process.env.DIST) win.loadFile(path.join(process.env.DIST, 'index.html'));
  }
}

const toggleWindow = async () => {
    if (!win || win.isDestroyed()) { createWindow(); return; }
    if (win.isVisible()) {
        for (let i = 1.0; i >= 0; i -= 0.1) {
            try { if (!win || win.isDestroyed()) return; win.setOpacity(i); } catch (e) { return; }
            await new Promise(r => setTimeout(r, 10));
        }
        if (win && !win.isDestroyed()) win.hide();
    } else {
        if (win && !win.isDestroyed()) { win.setOpacity(0); win.show(); win.focus(); }
        for (let i = 0; i <= 1.0; i += 0.1) {
            try { if (!win || win.isDestroyed()) return; win.setOpacity(i); } catch (e) { return; }
            await new Promise(r => setTimeout(r, 10));
        }
    }
};

let isCleanExit = false;
const startGracefulShutdown = () => {
    if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.setAlwaysOnTop(true, 'screen-saver');
        win.focus();
        win.webContents.send('app-closing');
    } else {
        isCleanExit = true;
        app.quit();
    }
};

app.on('before-quit', (e) => {
    if (isCleanExit) return;
    e.preventDefault();
    isQuitting = true; 
    startGracefulShutdown();
});

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('no-proxy-server');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); if (!win.isVisible()) win.show(); win.focus(); }
  });

  app.whenReady().then(async () => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    try {
        const data = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(data);
        allowDevTools = !!settings.isTerminalVisible;
    } catch (e) { allowDevTools = false; }

    createTray();
    createWindow();

    setTimeout(() => { checkUpdate(); }, 5000);

    ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });
    ipcMain.on('check-for-updates-manual', () => { autoUpdater.checkForUpdates(); });
    ipcMain.on('app-ready-to-quit', () => { isCleanExit = true; app.quit(); });
    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-maximize', () => { if (win?.isMaximized()) win?.unmaximize(); else win?.maximize(); });
    ipcMain.on('window-close', () => win?.close());
    
    ipcMain.handle('save-settings', async (_, settings) => {
        try { await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2)); return { success: true }; } catch (e) { return { success: false }; }
    });
    ipcMain.handle('load-settings', async () => {
        try { const data = await fs.readFile(settingsPath, 'utf-8'); return JSON.parse(data); } catch (e) { return null; }
    });
  });
}

function sendStatusToWindow(text: string) { win?.webContents.send('update-message', text); }

function checkUpdate() {
  autoUpdater.on('update-available', (info) => { win?.webContents.send('update-available', info); });
  autoUpdater.on('download-progress', (progressObj) => { win?.webContents.send('update-download-progress', progressObj); });
  autoUpdater.on('update-downloaded', (info) => { win?.webContents.send('update-ready', info); });
  
  autoUpdater.checkForUpdatesAndNotify();
  // Check every 10 minutes instead of every 10 seconds
  setInterval(() => { autoUpdater.checkForUpdatesAndNotify(); }, 600000);
}
