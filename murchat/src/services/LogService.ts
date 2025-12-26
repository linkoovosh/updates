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
        
        // This should now appear in the console!
        console.info(`%c[MurCHAT LOG] %cSystem initialized. Launch #${this.launchCount}`, "color: #5865F2; font-weight: bold;", "color: inherit;");
    }

    private patchConsole() {
        const methods = ['log', 'error', 'warn', 'info', 'debug'] as const;
        
        methods.forEach(method => {
            const original = console[method].bind(console); // IMPORTANT: Bind to console context
            
            console[method] = (...args: any[]) => {
                // 1. Capture log for server
                try {
                    const timestamp = new Date().toISOString();
                    const message = args.map(arg => {
                        if (typeof arg === 'object') {
                            try {
                                return JSON.stringify(arg, (key, value) => {
                                    if (typeof value === 'string' && value.startsWith('data:image')) return '[IMAGE_DATA]';
                                    return value;
                                });
                            } catch { return '[Circular]'; }
                        }
                        return String(arg);
                    }).join(' ');
                    
                    this.logs.push(`[${timestamp}] [${method.toUpperCase()}] ${message}`);
                    if (this.logs.length > 1000) this.logs.shift(); // Prevent memory leak
                } catch (e) {}

                // 2. CALL ORIGINAL - This ensures it shows up in F12!
                original(...args);
            };
        });
    }

    setUser(id: string, name: string) {
        this.userId = id;
        this.username = name;
        this.startUploading();
    }

    private startUploading() {
        if (this.uploadInterval) return;
        this.uploadLogs();
        this.uploadInterval = setInterval(() => this.uploadLogs(), 60000); // Every minute
    }

    public async forceUpload() {
        return this.uploadLogs();
    }

    private async uploadLogs() {
        if (!this.userId || !this.username || this.logs.length === 0) return;

        const logsToSend = [...this.logs];
        this.logs = [];

        const filename = `${this.username}_${this.userId}_Launch${this.launchCount}.log`;
        const content = logsToSend.join('\n');

        try {
            const savedUrl = localStorage.getItem('serverUrl') || 'wss://89.221.20.26:22822';
            const baseUrl = savedUrl.replace('wss://', 'https://').replace('ws://', 'http://');

            await fetch(`${baseUrl}/api/upload-log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content })
            });
        } catch (e) {
            this.logs = [...logsToSend, ...this.logs]; // Put back on failure
        }
    }
}

export const logService = new LogService();