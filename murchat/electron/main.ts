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

log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;

let win: BrowserWindow | null;
let tray: Tray | null = null;
let isQuitting = false;
let isUpdating = false; // NEW: Flag to bypass kitten screen
let allowDevTools = false;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function sendStatusToWindow(text: string) {
  if (win && !win.isDestroyed()) win.webContents.send('update-message', text);
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC || '', 'murchat.ico'), 
    width: 1200, height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 48 },
    transparent: false, backgroundColor: '#00000000', backgroundMaterial: 'mica',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, devTools: true, webviewTag: true
    },
    opacity: 0
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    callback({ responseHeaders: { ...responseHeaders, 'Access-Control-Allow-Origin': ['*'] } });
  });

  win.on('close', (event) => {
    if (isCleanExit || isUpdating) return true; // Bypass for updates
    if (!isQuitting && tray && app.isPackaged) {
      event.preventDefault();
      win?.hide();
      return false;
    }
    event.preventDefault();
    startGracefulShutdown();
    return false;
  });

  win.once('ready-to-show', () => {
      if (!win) return;
      win.show(); win.focus(); win.setOpacity(1);
      activityService.setWindow(win); activityService.start();
  });

  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
  else if (process.env.DIST) win.loadFile(path.join(process.env.DIST, 'index.html'));
}

let isCleanExit = false;
const startGracefulShutdown = () => {
    if (isUpdating) { app.quit(); return; } // No kittens during update!
    if (win && !win.isDestroyed()) {
        win.show(); win.setAlwaysOnTop(true); win.focus();
        win.webContents.send('app-closing');
    } else {
        isCleanExit = true; app.quit();
    }
};

app.on('before-quit', (e) => {
    if (isCleanExit || isUpdating) return; 
    e.preventDefault();
    isQuitting = true; 
    startGracefulShutdown();
});

app.whenReady().then(async () => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    createWindow();

    ipcMain.on('install-update', () => { 
        console.log("[Main] Update installation triggered. Bypassing graceful shutdown.");
        isUpdating = true; // SET FLAG!
        autoUpdater.quitAndInstall(false, true); // isSilent: false, isForceRunAfter: true
    });

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

    // ... other IPCs ...
    ipcMain.handle('get-screen-sources', async () => {
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], fetchWindowIcons: true });
        return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
    });

    setTimeout(() => { checkUpdate(); }, 5000);
});

function checkUpdate() {
  autoUpdater.on('update-available', (info) => { win?.webContents.send('update-available', info); });
  autoUpdater.on('download-progress', (p) => { win?.webContents.send('update-download-progress', p); });
  autoUpdater.on('update-downloaded', (info) => { win?.webContents.send('update-ready', info); });
  autoUpdater.checkForUpdatesAndNotify();
}

function toggleWindow() { if (win?.isVisible()) win.hide(); else win?.show(); }
