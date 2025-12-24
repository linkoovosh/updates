// Shared AudioContext to prevent conflicts between different services
let sharedContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
    if (!sharedContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        sharedContext = new AudioContextClass({
            latencyHint: 'interactive',
            sampleRate: 48000, // Standard high-quality rate
        });
        console.log('[AudioContext] Shared instance created. State:', sharedContext.state);
    }
    return sharedContext;
};

export const resumeAudioContext = async (): Promise<void> => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        console.log('[AudioContext] Resuming shared context...');
        await ctx.resume();
    }
};
