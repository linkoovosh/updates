import { getAudioContext } from '../utils/audioContext';

// INLINE WORKLET CODE (Bypasses all file path/CSP issues in Electron)
const workletCode = `
class MurClearProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isAiEnabled = false;
        this.vadThreshold = 0.005;
        this.isActive = false;
        this.holdCounter = 0;
        this.HOLD_FRAMES = 20;
        this.currentGain = 0;
        
        this.port.onmessage = (event) => {
            const { type, value } = event.data;
            if (type === 'setAiEnabled') this.isAiEnabled = value;
            if (type === 'setVadThreshold') this.vadThreshold = value;
        };
    }

    detectHumanVoice(buffer, sampleRate) {
        const minFreq = 85;
        const maxFreq = 400;
        const minPeriod = Math.floor(sampleRate / maxFreq);
        const maxPeriod = Math.floor(sampleRate / minFreq);
        const checkSize = Math.min(buffer.length, 1024);
        
        let energy = 0;
        for (let i = 0; i < checkSize; i += 4) energy += buffer[i] * buffer[i];
        energy = energy / (checkSize / 4);

        if (energy < 0.00001) return false;

        let bestCorrelation = 0;
        for (let lag = minPeriod; lag <= maxPeriod; lag += 2) {
            let sum = 0;
            let count = 0;
            for (let i = 0; i < checkSize - lag; i += 4) {
                sum += buffer[i] * buffer[i + lag];
                count++;
            }
            const correlation = sum / count;
            if (correlation > bestCorrelation) bestCorrelation = correlation;
        }

        let crossings = 0;
        for (let i = 1; i < buffer.length; i++) {
            if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) crossings++;
        }
        const zcr = crossings / buffer.length;
        const normalizedScore = bestCorrelation / energy;

        return normalizedScore > 0.15 && zcr < 0.6;
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input[0]) return true;

        const inputChannel = input[0];
        const outputChannel = output[0];

        if (!this.isAiEnabled) {
            outputChannel.set(inputChannel);
            return true;
        }

        let sum = 0;
        for (let i = 0; i < inputChannel.length; i++) sum += inputChannel[i] * inputChannel[i];
        const rms = Math.sqrt(sum / inputChannel.length);

        let isVoice = false;
        if (rms > this.vadThreshold) {
            isVoice = this.detectHumanVoice(inputChannel, sampleRate); // global sampleRate is available in Worklet scope
        }

        if (isVoice) {
            this.isActive = true;
            this.holdCounter = this.HOLD_FRAMES;
        } else if (this.isActive) {
            this.holdCounter--;
            if (this.holdCounter <= 0) this.isActive = false;
        }

        const targetGain = this.isActive ? 1.0 : 0.0;
        const smoothingFactor = this.isActive ? 0.5 : 0.1; 
        
        for (let i = 0; i < outputChannel.length; i++) {
            this.currentGain = (this.currentGain * (1 - smoothingFactor)) + (targetGain * smoothingFactor);
            outputChannel[i] = inputChannel[i] * this.currentGain;
        }

        return true;
    }
}

registerProcessor('mur-clear-processor', MurClearProcessor);
`;

export class AudioProcessor {
    private audioContext: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destinationNode: MediaStreamAudioDestinationNode | null = null;
    private processorNode: AudioWorkletNode | null = null;
    
    // Settings Cache
    private vadThreshold: number = 0.005;
    private isAiEnabled: boolean = false;
    
    // Public Stream
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
                // Create a Blob from the inline code
                const blob = new Blob([workletCode], { type: 'application/javascript' });
                const workletUrl = URL.createObjectURL(blob);
                
                console.log('[MurClear AI] Loading inline worklet...');
                await this.audioContext.audioWorklet.addModule(workletUrl);
                
                this.processorNode = new AudioWorkletNode(this.audioContext, 'mur-clear-processor');
                this.processorNode.connect(this.destinationNode!);
                
                // Sync initial settings
                this.processorNode.port.postMessage({ type: 'setAiEnabled', value: this.isAiEnabled });
                this.processorNode.port.postMessage({ type: 'setVadThreshold', value: this.vadThreshold });
                
                console.log('[MurClear AI] AudioWorklet initialized successfully.');
            } catch (err) {
                console.error('[MurClear AI] Failed to load inline AudioWorklet:', err);
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
        // Ensure initialization is COMPLETE before proceeding
        if (this.initPromise) {
            await this.initPromise;
        } else {
            await this.init();
        }

        if (!this.audioContext || !this.processorNode) {
            console.error('[MurClear AI] Worklet not ready, falling back to raw stream.');
            return stream;
        }
        
        if (this.audioContext.state !== 'running') {
            await this.audioContext.resume();
        }

        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch(e) {}
        }

        try {
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);
            this.sourceNode.connect(this.processorNode);
            
            // Force output stream realization
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
