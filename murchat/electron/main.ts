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
const DIST = path.join(__dirname, '../dist');
const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(__dirname, '../public') : DIST;

// SSL/TLS: Ignore certificate errors for our self-signed production server
app.commandLine.appendSwitch('ignore-certificate-errors');
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // Only ignore errors for our specific server IP
    if (url.includes('89.221.20.26')) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

// Single instance lock
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
    transparent: false, backgroundColor: '#1e1f22', // Set solid background to avoid white flash
    show: false, // Keep false initially but with a timeout fallback
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, devTools: true, webviewTag: true,
      sandbox: false // Sometimes helpful for native modules compatibility
    },
    opacity: 0
  });

  // --- SECURITY: Block DevTools Shortcuts ---
  win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
          if (!allowDevTools) {
              event.preventDefault();
          }
      }
  });

  // Fallback if ready-to-show never fires
  const showTimeout = setTimeout(() => {
    if (win && !win.isVisible()) {
      console.log("[Main] ready-to-show timeout, forcing show");
      win.show();
      win.setOpacity(1);
    }
  }, 5000);

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error(`[Main] Window failed to load: ${errorCode} - ${errorDescription}`);
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    callback({ responseHeaders: { ...responseHeaders, 'Access-Control-Allow-Origin': ['*'] } });
  });

  win.on('close', (event) => {
    if (isCleanExit || isUpdating) return true; 
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
      clearTimeout(showTimeout);
      if (!win) return;
      win.show(); win.focus(); win.setOpacity(1);
      activityService.setWindow(win); activityService.start();
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(DIST, 'index.html');
    log.info(`[Main] Loading production index: ${indexPath}`);
    win.loadFile(indexPath).catch(err => {
      log.error(`[Main] Failed to load index file: ${err}`);
    });
  }
}

let isCleanExit = false;
const startGracefulShutdown = () => {
    if (isUpdating) { 
        log.info("[Main] Shutdown: isUpdating is true, quitting immediately");
        isCleanExit = true; 
        app.quit(); 
        return; 
    }

    if (win && !win.isDestroyed()) {
        log.info("[Main] Shutdown: Sending app-closing to renderer");
        win.show(); win.setAlwaysOnTop(true); win.focus();
        win.webContents.send('app-closing');

        // Safety timeout: if renderer doesn't respond in 3 seconds, force quit
        setTimeout(() => {
            if (!isCleanExit) {
                log.warn("[Main] Shutdown: Renderer didn't respond in time, force quitting");
                isCleanExit = true;
                app.quit();
            }
        }, 3000);
    } else {
        log.info("[Main] Shutdown: No window, quitting immediately");
        isCleanExit = true; 
        app.quit();
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
    ipcMain.on('copy-to-clipboard', (_, text) => {
        if (text) clipboard.writeText(text);
    });

    // --- DEVTOOLS SECURITY IPC ---
    ipcMain.on('UNLOCK_DEV_TOOLS', () => {
        allowDevTools = true;
        console.log("[Main] DevTools UNLOCKED by renderer request.");
    });

    ipcMain.on('LOCK_DEV_TOOLS', () => {
        allowDevTools = false;
        if (win) win.webContents.closeDevTools();
        console.log("[Main] DevTools LOCKED.");
    });

    ipcMain.on('OPEN_DEV_TOOLS', () => {
        if (allowDevTools && win) {
            win.webContents.openDevTools({ mode: 'detach' });
        }
    });
    // -----------------------------

    ipcMain.handle('upload-client-log', async (_, { filename, content }) => {
        try {
            const logDir = path.join(app.getPath('userData'), 'client_logs');
            await fs.mkdir(logDir, { recursive: true });
            await fs.writeFile(path.join(logDir, filename), content);
            return { success: true };
        } catch (e) {
            return { success: false };
        }
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
    } catch (e) {
        log.error("[Main] Failed to initialize tray:", e);
    }
    
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
  autoUpdater.autoDownload = true; // Auto download when found
  autoUpdater.allowDowngrade = false; // Never go backwards
  autoUpdater.allowPrerelease = true; // Allow build number patches

  // Timeout to prevent infinite loading screen if GitHub/Update server is unreachable
  const updateTimeout = setTimeout(() => {
      log.warn("[Updater] Update check timed out after 10s. Forcing app start.");
      if (win && !win.isDestroyed()) {
          win.webContents.send('update-not-available');
      }
  }, 10000);

  autoUpdater.on('checking-for-update', () => {
    log.info("[Updater] Checking for updates...");
    sendStatusToWindow('Проверка обновлений...');
  });

  autoUpdater.on('update-available', (info) => {
    clearTimeout(updateTimeout);
    isDownloading = true; // LOCK
    log.info('[Updater] Update available:', info.version);
    win?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    clearTimeout(updateTimeout);
    isDownloading = false; // UNLOCK
    log.info('[Updater] Update not available.');
    win?.webContents.send('update-not-available');
  });

  autoUpdater.on('error', (err) => {
    clearTimeout(updateTimeout);
    isDownloading = false; // UNLOCK
    log.error('[Updater] Error in auto-updater: ', err);
    win?.webContents.send('update-error', err.message);
    win?.webContents.send('update-not-available'); 
  });

  autoUpdater.on('download-progress', (progressObj) => {
    isDownloading = true;
    const percent = Math.floor(progressObj.percent);
    log.info(`[Updater] Downloading: ${percent}%`);
    win?.webContents.send('update-download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    isDownloading = false;
    log.info('[Updater] Update downloaded');
    win?.webContents.send('update-ready', info);
  });

  // Start the check immediately
  autoUpdater.checkForUpdatesAndNotify();

  // Loop every 10 minutes, not 10 seconds!
  setInterval(() => {
      if (!isDownloading) {
          autoUpdater.checkForUpdatesAndNotify().catch(err => {
              log.error("[Updater] Interval check failed:", err);
          });
      }
  }, 600000); 
}

let isDownloading = false; // Prevent overlapping downloads

function toggleWindow() { if (win?.isVisible()) win.hide(); else win?.show(); }
