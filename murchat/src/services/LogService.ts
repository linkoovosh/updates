class LogService {
    private logs: string[] = [];
    private launchCount: number = 0;
    private userId: string | null = null;
    private username: string | null = null;
    private isInitialized = false;
    private uploadInterval: NodeJS.Timeout | null = null;

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // Increment launch count
        const count = localStorage.getItem('murchat_launch_count');
        this.launchCount = count ? parseInt(count, 10) + 1 : 1;
        localStorage.setItem('murchat_launch_count', this.launchCount.toString());

        this.patchConsole();
        
        // Log startup info directly (won't trigger infinite loop because patch calls original first)
        console.log(`[LogService] App launched. Count: ${this.launchCount}`);
    }

    private patchConsole() {
        const methods = ['log', 'error', 'warn', 'info', 'debug'] as const;
        
        methods.forEach(method => {
            const original = console[method];
            console[method] = (...args: any[]) => {
                // 1. Execute original functionality
                original.apply(console, args);

                // 2. Capture log
                try {
                    const timestamp = new Date().toISOString();
                    const message = args.map(arg => {
                        if (typeof arg === 'object') {
                            try {
                                return JSON.stringify(arg, (key, value) => {
                                    if (typeof value === 'string') {
                                        if (value.startsWith('data:image')) {
                                            return value.substring(0, 30) + '...[TRUNCATED BASE64 IMAGE]';
                                        }
                                        if (value.length > 500) {
                                            return value.substring(0, 50) + `...[TRUNCATED ${value.length} chars]`;
                                        }
                                    }
                                    return value;
                                });
                            } catch {
                                return '[Circular/Unserializable]';
                            }
                        }
                        return String(arg);
                    }).join(' ');
                    
                    const logLine = `[${timestamp}] [${method.toUpperCase()}] ${message}`;
                    this.logs.push(logLine);
                } catch (e) {
                    // Fail silently to avoid crash in logger
                }
            };
        });
    }

    setUser(id: string, name: string) {
        this.userId = id;
        this.username = name;
        
        // Start uploading periodically once user is known
        this.startUploading();
    }

    private startUploading() {
        if (this.uploadInterval) return;
        
        // Upload immediately to catch startup logs
        this.uploadLogs();

        // Then every 2 minutes
        this.uploadInterval = setInterval(() => {
            this.uploadLogs();
        }, 120000);
    }

    public async forceUpload() {
        return this.uploadLogs();
    }

    private async uploadLogs() {
        if (!this.userId || !this.username || this.logs.length === 0) return;

        const logsToSend = [...this.logs];
        this.logs = []; // Clear buffer

        // Filename: Username_ID_LaunchN.log
        const filename = `${this.username}_${this.userId}_Launch${this.launchCount}.log`;
        const content = logsToSend.join('\n');

        try {
            if ((window as any).electron) {
                await (window as any).electron.uploadClientLog({ filename, content });
                console.log('[LogService] Upload success via IPC');
            } else {
                console.warn('[LogService] Electron not available, cannot upload logs');
            }
        } catch (e) {
            console.error('[LogService] Upload failed:', e);
            // If upload fails, put logs back at the START of the buffer to retry later
            this.logs = [...logsToSend, ...this.logs];
        }
    }
}

export const logService = new LogService();
