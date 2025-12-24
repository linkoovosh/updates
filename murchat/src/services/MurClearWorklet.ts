// MurClear AI Audio Worklet Processor
declare const sampleRate: number;

class MurClearProcessor extends AudioWorkletProcessor {
    private isAiEnabled = false;
    private vadThreshold = 0.005;
    private isActive = false;
    private holdCounter = 0;
    private readonly HOLD_FRAMES = 20;
    private currentGain = 0;

    constructor() {
        super();
        this.port.onmessage = (event) => {
            const { type, value } = event.data;
            if (type === 'setAiEnabled') this.isAiEnabled = value;
            if (type === 'setVadThreshold') this.vadThreshold = value;
        };
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

        return normalizedScore > 0.15 && zcr < 0.6;
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
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
            isVoice = this.detectHumanVoice(inputChannel, sampleRate);
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
