import { getAudioContext } from '../utils/audioContext';

// MurClear AI 3.0 - AudioWorklet Implementation
export class AudioProcessor {
    private audioContext: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destinationNode: MediaStreamAudioDestinationNode | null = null;
    private processorNode: AudioWorkletNode | null = null;
    
    // Settings Cache
    private vadThreshold: number = 0.005;
    private isAiEnabled: boolean = false;
    
    // Public Stream (Stable)
    public outputStream: MediaStream;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.audioContext = getAudioContext();
        this.destinationNode = this.audioContext.createMediaStreamDestination();
        this.outputStream = this.destinationNode.stream;
        this.init();
    }

    private async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            if (!this.audioContext) return;

            try {
                try {
                    // Try relative path first (Dev and standard Vite)
                    const workletUrl = new URL('./MurClearWorklet.ts', import.meta.url);
                    console.log('[MurClear AI] Attempting to load worklet from:', workletUrl.href);
                    await this.audioContext.audioWorklet.addModule(workletUrl);
                } catch (e) {
                    console.warn('[MurClear AI] Relative load failed, trying absolute path...', e);
                    try {
                        // Fallback for some Electron environments
                        await this.audioContext.audioWorklet.addModule('src/services/MurClearWorklet.ts');
                    } catch (e2) {
                        console.error('[MurClear AI] All load attempts failed:', e2);
                        throw e2;
                    }
                }
                    
                this.processorNode = new AudioWorkletNode(this.audioContext, 'mur-clear-processor');
                this.processorNode.connect(this.destinationNode!);
                
                // Sync initial settings
                this.processorNode.port.postMessage({ type: 'setAiEnabled', value: this.isAiEnabled });
                this.processorNode.port.postMessage({ type: 'setVadThreshold', value: this.vadThreshold });
                
                console.log('[MurClear AI] AudioWorklet initialized successfully.');
            } catch (err) {
                console.error('[MurClear AI] Failed to load or initialize AudioWorklet:', err);
            }
        })();

        return this.initPromise;
    }

    setAiEnabled(enabled: boolean) {
        this.isAiEnabled = enabled;
        if (this.processorNode) {
            this.processorNode.port.postMessage({ type: 'setAiEnabled', value: enabled });
        }
        console.log(`[MurClear AI] State: ${enabled ? 'ON' : 'OFF'}`);
    }

    setVadThreshold(threshold: number) {
        this.vadThreshold = 0.001 + (threshold / 100) * 0.049; 
        if (this.processorNode) {
            this.processorNode.port.postMessage({ type: 'setVadThreshold', value: this.vadThreshold });
        }
    }

    async processStream(stream: MediaStream): Promise<MediaStream> {
        await this.init(); // Ensure worklet is loaded

        if (!this.audioContext || !this.processorNode) {
            console.error('[MurClear AI] Worklet not ready, falling back to raw stream.');
            return stream;
        }
        
        if (this.audioContext.state !== 'running') {
            console.log('[MurClear AI] Resuming AudioContext...');
            await this.audioContext.resume();
        }

        // Clean up old source
        if (this.sourceNode) {
            try { 
                this.sourceNode.disconnect(); 
            } catch(e) {}
        }

        try {
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);
            this.sourceNode.connect(this.processorNode);
            
            // If outputStream is dead or has no tracks, recreate destination
            if (!this.outputStream || this.outputStream.getAudioTracks().length === 0 || this.outputStream.getAudioTracks()[0].readyState === 'ended') {
                console.log('[MurClear AI] Re-creating destination node...');
                this.destinationNode = this.audioContext.createMediaStreamDestination();
                this.outputStream = this.destinationNode.stream;
                this.processorNode.disconnect();
                this.processorNode.connect(this.destinationNode);
            }

            console.log('[MurClear AI] Processor CONNECTED to raw stream:', stream.id);
            return this.outputStream;
        } catch (error) {
            console.error('[MurClear AI] Error connecting source:', error);
            return stream;
        }
    }
}

export const audioProcessor = new AudioProcessor();