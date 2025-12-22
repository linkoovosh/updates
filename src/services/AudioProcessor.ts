export class AudioProcessor {
    private audioContext: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destinationNode: MediaStreamAudioDestinationNode | null = null;
    private processorNode: ScriptProcessorNode | null = null;
    private outputGain: GainNode | null = null; // NEW: Stable output gate
    
    // Settings
    private vadThreshold: number = 0.005; // Base volume threshold
    private isAiEnabled: boolean = false;
    
    // VAD State
    private isActive: boolean = false;
    private holdCounter: number = 0;
    private readonly HOLD_FRAMES = 20; // ~400ms

    // Smoothing
    private currentGain: number = 0;

    // Public Stream (Stable)
    public outputStream: MediaStream;

    constructor() {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            this.audioContext = new AudioContextClass();
            this.destinationNode = this.audioContext.createMediaStreamDestination();
            this.outputStream = this.destinationNode.stream;
            
            // Create a permanent gate
            this.outputGain = this.audioContext.createGain();
            this.outputGain.connect(this.destinationNode);

            this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);
            this.processorNode.connect(this.outputGain);
            
            this.setupProcessor();
        } else {
            this.outputStream = new MediaStream();
        }
    }

    private setupProcessor() {
        if (!this.processorNode) return;

        this.processorNode.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);
            
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            if (!this.isAiEnabled) {
                output.set(input);
                return;
            }

            let sum = 0;
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
            const rms = Math.sqrt(sum / input.length);

            let isVoice = false;
            // Sensitivity check
            if (rms > this.vadThreshold) {
                isVoice = this.detectHumanVoice(input, this.audioContext!.sampleRate);
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
            
            for (let i = 0; i < output.length; i++) {
                this.currentGain = (this.currentGain * (1 - smoothingFactor)) + (targetGain * smoothingFactor);
                output[i] = input[i] * this.currentGain;
            }
        };
    }

    setAiEnabled(enabled: boolean) {
        this.isAiEnabled = enabled;
        this.currentGain = enabled ? 0 : 1;
        this.isActive = !enabled;
        console.log(`[MurClear AI] State: ${enabled ? 'ON' : 'OFF'}`);
    }

    setVadThreshold(threshold: number) {
        this.vadThreshold = 0.002 + (threshold / 100) * 0.078; 
    }

    async processStream(stream: MediaStream): Promise<MediaStream> {
        if (!this.audioContext || !this.destinationNode) {
            console.error('[MurClear AI] AudioContext not initialized!');
            return stream;
        }
        
        if (this.audioContext.state !== 'running') {
            console.log('[MurClear AI] Resuming AudioContext...');
            await this.audioContext.resume();
        }

        // Clean up old source
        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch(e) {}
        }

        try {
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);
            this.sourceNode.connect(this.processorNode!);
            console.log('[MurClear AI] Processor CONNECTED to raw stream:', stream.id);
            return this.outputStream;
        } catch (error) {
            console.error('[MurClear AI] Error connecting source:', error);
            return stream;
        }
    }

    private detectHumanVoice(buffer: Float32Array, sampleRate: number): boolean {
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

        return normalizedScore > 0.3 && zcr < 0.4;
    }
}

export const audioProcessor = new AudioProcessor();