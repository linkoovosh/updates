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
let isUpdating = false; 
let allowDevTools = false;
let isDownloading = false;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const DIST = path.join(__dirname, '../dist');
const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(__dirname, '../public') : DIST;

app.commandLine.appendSwitch('ignore-certificate-errors');
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.includes('89.221.20.26')) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

function sendStatusToWindow(text: string) {
  if (win && !win.isDestroyed()) win.webContents.send('update-message', text);
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(VITE_PUBLIC, 'murchat.ico'), 
    width: 1200, height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 48 },
    transparent: false, backgroundColor: '#1e1f22',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, devTools: true, webviewTag: true,
      sandbox: false
    },
    opacity: 0
  });

  win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
          if (!allowDevTools) event.preventDefault();
      }
  });

  const showTimeout = setTimeout(() => {
    if (win && !win.isVisible()) {
      win.show();
      win.setOpacity(1);
    }
  }, 5000);

  win.once('ready-to-show', () => {
      clearTimeout(showTimeout);
      if (!win) return;
      win.show(); win.focus(); win.setOpacity(1);
      activityService.setWindow(win); activityService.start();
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(DIST, 'index.html')).catch(err => log.error(err));
  }
}

app.on('before-quit', (e) => {
    if (isUpdating) return; 
    isQuitting = true; 
});

app.whenReady().then(async () => {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    createWindow();

    ipcMain.on('install-update', () => { 
        isUpdating = true;
        autoUpdater.quitAndInstall(false, true);
    });

    ipcMain.on('app-ready-to-quit', () => { app.quit(); });
    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-maximize', () => { if (win?.isMaximized()) win?.unmaximize(); else win?.maximize(); });
    ipcMain.on('window-close', () => win?.close());
    ipcMain.on('copy-to-clipboard', (_, text) => { if (text) clipboard.writeText(text); });

    ipcMain.on('UNLOCK_DEV_TOOLS', () => { allowDevTools = true; });
    ipcMain.on('LOCK_DEV_TOOLS', () => { allowDevTools = false; if (win) win.webContents.closeDevTools(); });
    ipcMain.on('OPEN_DEV_TOOLS', () => { if (allowDevTools && win) win.webContents.openDevTools({ mode: 'detach' }); });

    // --- Restore Missing Settings IPCs ---
    ipcMain.handle('save-settings', async (_, settings) => {
        try { 
            await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2)); 
            return { success: true }; 
        } catch (e) { 
            log.error("Failed to save settings:", e);
            return { success: false }; 
        }
    });

    ipcMain.handle('load-settings', async () => {
        try { 
            const data = await fs.readFile(settingsPath, 'utf-8'); 
            return JSON.parse(data); 
        } catch (e) { 
            return null; // Let React use defaults
        }
    });

    ipcMain.handle('get-screen-sources', async () => {
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], fetchWindowIcons: true });
        return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
    });

    // Initialize Tray
    try {
        const iconPath = path.join(VITE_PUBLIC, 'murchat.ico');
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show MurCHAT', click: () => win?.show() },
            { type: 'separator' },
            { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip('MurCHAT');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
            if (win?.isVisible()) win.hide();
            else win?.show();
        });
    } catch (e) { log.error("Tray error:", e); }

    // Single check on launch after 5s
    setTimeout(() => { checkUpdate(); }, 5000);
});

function checkUpdate() {
  if (isDownloading) return;

  autoUpdater.autoDownload = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = true;

  const updateTimeout = setTimeout(() => {
      log.warn("[Updater] Timeout. Proceeding to app.");
      if (win && !win.isDestroyed()) win.webContents.send('update-not-available');
  }, 15000);

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Проверка обновлений...');
  });

  autoUpdater.on('update-available', (info) => {
    clearTimeout(updateTimeout);
    isDownloading = true;
    log.info('[Updater] Available:', info.version);
    win?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    clearTimeout(updateTimeout);
    isDownloading = false;
    win?.webContents.send('update-not-available');
  });

  autoUpdater.on('error', (err) => {
    clearTimeout(updateTimeout);
    isDownloading = false;
    log.error('[Updater] Error:', err);
    win?.webContents.send('update-not-available'); 
  });

  autoUpdater.on('download-progress', (progressObj) => {
    isDownloading = true;
    win?.webContents.send('update-download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    isDownloading = false;
    win?.webContents.send('update-ready', info);
  });

  autoUpdater.checkForUpdatesAndNotify().catch(e => log.error(e));
}
