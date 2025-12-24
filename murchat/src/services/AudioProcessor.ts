// murchat/src/services/AudioProcessor.ts

const MurClearWorklet = `
class MurClearWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.port.onmessage = (e) => {
      if (e.data.type === 'setEnabled') this.enabled = e.data.value;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) return true;

    for (let channel = 0; input[channel] && channel < output.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        if (!this.enabled) {
          outputChannel[i] = inputChannel[i];
          continue;
        }

        let sample = inputChannel[i];
        const absSample = Math.abs(sample);
        
        // Very basic noise gate + soft knee
        if (absSample < 0.005) {
          sample = 0;
        } else if (absSample < 0.02) {
          const factor = (absSample - 0.005) / (0.02 - 0.005);
          sample *= factor;
        }
        
        outputChannel[i] = sample;
      }
    }
    return true;
  }
}
registerProcessor('murclear-worklet', MurClearWorklet);
`;

class AudioProcessor {
    private audioContext: AudioContext | null = null;
    private processorNode: AudioWorkletNode | null = null;
    private isAiEnabled: boolean = false;
    private initPromise: Promise<void> | null = null;

    async init() {
        if (this.audioContext) return;

        this.initPromise = (async () => {
            console.log('[MurClear AI] Loading inline worklet...');
            this.audioContext = new AudioContext({ sampleRate: 48000 });
            
            try {
                const blob = new Blob([MurClearWorklet], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                await this.audioContext.audioWorklet.addModule(url);
                
                this.processorNode = new AudioWorkletNode(this.audioContext, 'murclear-worklet', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [1] 
                });
                
                this.processorNode.port.postMessage({ type: 'setEnabled', value: this.isAiEnabled });
                console.log('[MurClear AI] AudioWorklet initialized successfully (Mono Mode).');
            } catch (error) {
                console.error('[MurClear AI] Failed to initialize AudioWorklet:', error);
            }
        })();

        return this.initPromise;
    }

    setAiEnabled(enabled: boolean) {
        this.isAiEnabled = enabled;
        if (this.processorNode) {
            this.processorNode.port.postMessage({ type: 'setEnabled', value: enabled });
        }
        console.log(`[MurClear AI] State: ${enabled ? 'ON' : 'OFF'}`);
    }

    async processStream(stream: MediaStream): Promise<MediaStream> {
        if (this.initPromise) {
            await this.initPromise;
        } else {
            await this.init();
        }

        if (!this.audioContext || !this.processorNode) {
            console.warn('[MurClear AI] Processor not ready, returning raw stream');
            return stream;
        }

        const source = this.audioContext.createMediaStreamSource(stream);
        const destination = this.audioContext.createMediaStreamDestination();
        
        // Ensure destination is mono
        destination.channelCount = 1;

        source.connect(this.processorNode);
        this.processorNode.connect(destination);

        console.log('[MurClear AI] Processor CONNECTED to raw stream (Mono Path)');
        return destination.stream;
    }
}

export const audioProcessor = new AudioProcessor();
