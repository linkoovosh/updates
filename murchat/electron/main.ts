import { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { activityService } from './activityService'; // NEW

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logging
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

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
      // Robust icon path finding
      const possiblePaths = [
          path.join(process.env.VITE_PUBLIC || '', 'murchat.ico'),
          path.join(process.resourcesPath, 'murchat.ico'),
          path.join(__dirname, '../../murchat.ico'), // Inside asar root
          path.join(__dirname, '../public/murchat.ico') // Dev structure
      ];

      let iconPath = '';
      const fsSync = require('fs');
      for (const p of possiblePaths) {
          if (fsSync.existsSync(p)) {
              iconPath = p;
              break;
          }
      }

      if (!iconPath) {
          console.error("Tray icon not found in any of the paths:", possiblePaths);
          log.error("Tray icon not found");
          return; // Don't create tray without icon
      }

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
      console.error("Failed to create tray:", e);
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
        color: '#00000000', // Transparent background
        symbolColor: '#ffffff', // White icons
        height: 48 // Match TopBar height
    },
    transparent: false,
    backgroundColor: '#00000000',
    // vibrancy: 'fullscreen-ui', 
    backgroundMaterial: 'mica',
    resizable: true,
    maximizable: true,
    show: false, // Don't show immediately, wait for ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      webviewTag: true // Enable <webview> tag for Shared Browser
    },
    opacity: 0 // Start invisible for fade-in
  });

  win.webContents.on('before-input-event', (event, input) => {
      if (allowDevTools) return;
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
          event.preventDefault();
      }
      if (((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
          event.preventDefault();
      }
  });

  win.on('close', (event) => {
    if (isCleanExit) return true;

    // Only minimize to tray if tray exists AND app is packaged (production)
    if (!isQuitting && tray && app.isPackaged) {
      event.preventDefault();
      // Smooth fade out before hiding
      const fadeOut = async () => {
          if (!win) return;
          for (let i = 1.0; i >= 0; i -= 0.1) {
              try {
                  if (!win || win.isDestroyed()) return;
                  win.setOpacity(i);
              } catch (e) { return; }
              await new Promise(r => setTimeout(r, 10)); // 10ms * 10 steps = 100ms
          }
          if (win && !win.isDestroyed()) win.hide();
      };
      fadeOut();
      return false;
    }
    
    // Graceful Shutdown (Dev or Quit)
    event.preventDefault();
    startGracefulShutdown();
    return false;
  });

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'media', 
      'mediaKeySystem', 
      'audioCapture', 
      'videoCapture', 
      'display-capture', 
      'notifications',
      'microphone',
      'camera'
    ];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      console.log(`Permission denied by MurCHAT: ${permission}`);
      log.warn(`Permission denied by MurCHAT: ${permission}`);
      callback(false);
    }
  });

  win.webContents.session.setPermissionCheckHandler((webContents, permission, origin) => {
    const allowedPermissions = [
      'media', 
      'mediaKeySystem', 
      'audioCapture', 
      'videoCapture', 
      'display-capture', 
      'notifications',
      'microphone',
      'camera'
    ];
    if (allowedPermissions.includes(permission)) {
      return true;
    }
    return false;
  });

  win.on('maximize', () => {
    win?.webContents.send('window-maximized', true);
  });
  win.on('unmaximize', () => {
    win?.webContents.send('window-maximized', false);
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });
  
  // Show window when ready to prevent flickering
  win.once('ready-to-show', async () => {
      if (!win) return;
      win.show();
      win.focus();
      
      // Start Activity Tracking
      activityService.setWindow(win);
      activityService.start();

      // Smooth fade in
      for (let i = 0; i <= 1.0; i += 0.1) {
          win.setOpacity(i);
          await new Promise(r => setTimeout(r, 15));
      }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL).catch(e => {
      console.error('Failed to load URL:', e);
    });
  } else {
    if (process.env.DIST) {
      win.loadFile(path.join(process.env.DIST, 'index.html')).catch(e => {
          log.error("Failed to load index.html:", e);
      });
    }
  }
}

const toggleWindow = async () => {
    if (!win || win.isDestroyed()) {
        createWindow();
        return;
    }
    
    if (win.isVisible()) {
        // Fade out and hide
        for (let i = 1.0; i >= 0; i -= 0.1) {
            try {
                if (!win || win.isDestroyed()) return;
                win.setOpacity(i);
            } catch (e) { return; }
            await new Promise(r => setTimeout(r, 10));
        }
        if (win && !win.isDestroyed()) win.hide();
    } else {
        // Prepare for fade in
        if (win && !win.isDestroyed()) {
            win.setOpacity(0);
            win.show();
            win.focus();
        }
        // Fade in
        for (let i = 0; i <= 1.0; i += 0.1) {
            try {
                if (!win || win.isDestroyed()) return;
                win.setOpacity(i);
            } catch (e) { return; }
            await new Promise(r => setTimeout(r, 10));
        }
    }
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
    win = null;
  }
});

let isCleanExit = false;

const startGracefulShutdown = () => {
    if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true);
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

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.includes('localhost') || url.includes('89.221.20.26')) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('no-proxy-server');
// Allow autoplay without user interaction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');


// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.on('activate', () => {
    if (win === null) {
      createWindow();
    } else {
        win.show();
    }
  });

// Helper to manage auto-launch
function updateAutoLaunch(enabled: boolean) {
    if (!app.isPackaged) return; // Don't mess with dev env
    
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
    });
}

  app.whenReady().then(async () => {
    // Try to load settings, safe fail
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    try {
        const data = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(data);
        allowDevTools = !!settings.isTerminalVisible;
        
        // Apply auto-launch setting (default to true if not specified)
        const shouldAutoLaunch = settings.autoLaunch !== false; 
        updateAutoLaunch(shouldAutoLaunch);

    } catch (e) {
        allowDevTools = false;
        // Default: Auto-launch enabled on first run
        updateAutoLaunch(true); 
    }

    createTray(); // Try create tray (safe inside function)
    createWindow();

    try {
        // Start check after a small delay to ensure network is ready
        setTimeout(() => {
            checkUpdate();
        }, 5000);
    } catch (e) {
        console.error("AutoUpdate initialization error:", e);
    }
    
    sendStatusToWindow('Загрузка приложения...');

    // IPC Handlers
    ipcMain.handle('save-settings', async (_, settings) => {
      try {
        allowDevTools = !!settings.isTerminalVisible;
        
        // Handle Auto-Launch toggle
        if (settings.autoLaunch !== undefined) {
            updateAutoLaunch(settings.autoLaunch);
        }

        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
      } catch (error) {
        return { success: false, error };
      }
    });

    ipcMain.handle('load-settings', async () => {
      try {
        const data = await fs.readFile(settingsPath, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        return null; 
      }
    });

    ipcMain.handle('upload-client-log', async (_, data) => {
        log.info('IPC: upload-client-log called');
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(data);
            const options = {
                hostname: '89.221.20.26',
                port: 22822,
                path: '/api/upload-log',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                rejectUnauthorized: false // Allow self-signed cert
            };

            const req = https.request(options, (res) => {
                log.info(`Log upload response status: ${res.statusCode}`);
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Server returned status: ${res.statusCode}`));
                }
            });

            req.on('error', (e) => {
                log.error('Main Process: Log upload failed:', e);
                reject(e);
            });

            req.write(postData);
            req.end();
        });
    });

    ipcMain.handle('get-screen-sources', async () => {
      try {
          const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], fetchWindowIcons: true });
          return sources.map(source => ({
              id: source.id,
              name: source.name,
              thumbnail: source.thumbnail.toDataURL()
          }));
      } catch (e) {
          console.error('Error getting screen sources:', e);
          return [];
      }
    });

    ipcMain.handle('get-current-window-source-id', async () => {
        if (!win) return null;
        try {
            const sources = await desktopCapturer.getSources({ types: ['window'] });
            // Electron window titles might vary, but usually match document.title
            // Reliable way: match by process ID or heuristic if title is known.
            // Or just return the first one that looks like our app.
            // Since we set title in createWindow but it changes, let's try to match "MurCHAT".
            const mySource = sources.find(s => s.name === 'MurCHAT' || s.name.includes('MurCHAT'));
            return mySource ? mySource.id : null;
        } catch (e) {
            console.error('Error finding window source:', e);
            return null;
        }
    });

    // Clipboard Handler
    ipcMain.on('copy-to-clipboard', (_, text) => {
        if (text) {
            clipboard.writeText(text);
        }
    });

    // Cleanup Handler
    ipcMain.on('app-ready-to-quit', () => {
        isCleanExit = true;
        app.quit();
    });

    // Window Controls
    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-maximize', () => {
      if (win?.isMaximized()) win?.unmaximize();
      else win?.maximize();
    });
    ipcMain.on('window-close', () => win?.close());

    // Update IPCs
    ipcMain.on('install-update', () => {
        autoUpdater.quitAndInstall();
    });

    ipcMain.on('check-for-updates-manual', () => {
        autoUpdater.checkForUpdates();
    });
  });
}

function sendStatusToWindow(text: string) {
  win?.webContents.send('update-message', text);
}

function checkUpdate() {
  autoUpdater.autoDownload = true; // Auto download when found
  
  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Проверка обновлений...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    win?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
    win?.webContents.send('update-not-available');
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater: ', err);
    win?.webContents.send('update-error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    log.info(log_message);
    win?.webContents.send('update-download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded');
    win?.webContents.send('update-ready', info);
  });

  // Start the check immediately
  autoUpdater.checkForUpdatesAndNotify();

  // Loop every 10 seconds
  setInterval(() => {
      // log.info('Auto-checking for updates (10s cycle)...'); // Uncomment if you want to flood logs
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
          // Suppress errors during interval checks to avoid console spam if offline
      });
  }, 10000);
}

// ... somewhere inside app.whenReady() add this IPC handler ...
    ipcMain.on('install-update', () => {
        autoUpdater.quitAndInstall();
    });

    ipcMain.on('check-for-updates-manual', () => {
        autoUpdater.checkForUpdates();
    });