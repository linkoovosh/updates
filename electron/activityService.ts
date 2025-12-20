import { app, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import path from 'path';

// Cache for icons to avoid re-reading them constantly
const iconCache = new Map<string, string>(); // path -> base64

export class ActivityService {
    private win: BrowserWindow | null = null;
    private interval: NodeJS.Timeout | null = null;
    private lastActivity: string | null = null;

    constructor() {}

    public setWindow(win: BrowserWindow) {
        this.win = win;
    }

    public start() {
        if (this.interval) return;
        
        // Check every 10 seconds
        this.interval = setInterval(() => this.checkActivity(), 10000);
        this.checkActivity();
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    private async checkActivity() {
        if (!this.win || this.win.isDestroyed()) return;

        try {
            // PowerShell command to get process with active window title and path
            // We sort by MainWindowHandle to try and guess the active one, but it's tricky.
            // Simplified: Get all processes with a title, excluding some system ones.
            const psCommand = `
                Get-Process | 
                Where-Object { $_.MainWindowTitle -ne "" -and $_.Path -ne $null } | 
                Select-Object -Property Path, MainWindowTitle, ProcessName | 
                ConvertTo-Json -Compress
            `;

            exec(`powershell -NoProfile -Command "${psCommand}"`, { maxBuffer: 1024 * 1024 * 5 }, async (error, stdout) => {
                if (error) {
                    // console.error("Activity check failed:", error); // Silence logs
                    return;
                }

                try {
                    const processes = JSON.parse(stdout);
                    // Single object vs Array handling
                    const procList = Array.isArray(processes) ? processes : [processes];

                    // Filter out known boring apps
                    const ignoredNames = ['explorer', 'chrome', 'msedge', 'firefox', 'murchat', 'electron', 'discord', 'code'];
                    
                    // Find a likely "game" or interesting app. 
                    // Priority: Not in ignored list.
                    const interestingApp = procList.find((p: any) => 
                        p.Path && 
                        !ignoredNames.includes(p.ProcessName.toLowerCase())
                    );

                    if (interestingApp) {
                        const appPath = interestingApp.Path;
                        const appName = interestingApp.MainWindowTitle || interestingApp.ProcessName;
                        
                        // Check if changed to avoid spam
                        const activityKey = appPath + appName;
                        if (this.lastActivity === activityKey) return;
                        this.lastActivity = activityKey;

                        // Get Icon
                        let iconData = iconCache.get(appPath);
                        if (!iconData) {
                            try {
                                const nativeIcon = await app.getFileIcon(appPath, { size: 'normal' });
                                iconData = nativeIcon.toDataURL();
                                iconCache.set(appPath, iconData);
                            } catch (e) {
                                // Failed to get icon, use default or ignore
                            }
                        }

                        // Send to Renderer
                        this.win.webContents.send('activity-update', {
                            type: 'playing',
                            name: interestingApp.ProcessName, // e.g. "dota2"
                            details: appName, // e.g. "Dota 2"
                            icon: iconData,
                            startedAt: Date.now() // Approximation
                        });
                    } else {
                        // Nothing interesting, send clear
                        if (this.lastActivity !== null) {
                            this.lastActivity = null;
                            this.win.webContents.send('activity-update', null);
                        }
                    }

                } catch (e) {
                    // JSON parse error or empty
                }
            });

        } catch (e) {
            console.error("Activity Loop Error:", e);
        }
    }
}

export const activityService = new ActivityService();
