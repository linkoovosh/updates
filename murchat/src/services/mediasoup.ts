import * as mediasoupClient from 'mediasoup-client';
import { C2S_MSG_TYPE, S2C_MSG_TYPE } from '@common/types';
import { webRTCService } from './webrtc';
import { audioProcessor } from './AudioProcessor';
import { playScreenshareStart } from '../utils/soundUtils';

class MediasoupService {
    device: mediasoupClient.types.Device | null = null;
    sendTransport: mediasoupClient.types.Transport | null = null;
    recvTransport: mediasoupClient.types.Transport | null = null;
    audioProducer: mediasoupClient.types.Producer | null = null;
    videoProducer: mediasoupClient.types.Producer | null = null; // NEW
    screenProducer: mediasoupClient.types.Producer | null = null;
    screenAudioProducer: mediasoupClient.types.Producer | null = null;
    browserProducer: mediasoupClient.types.Producer | null = null;
    browserAudioProducer: mediasoupClient.types.Producer | null = null;
    consumers: Map<string, mediasoupClient.types.Consumer> = new Map();
    producerToUser: Map<string, string> = new Map();
    producerAppData: Map<string, any> = new Map();
    
    private rawMicStream: MediaStream | null = null; // NEW: Raw stream from getUserMedia
    private processedMicStream: MediaStream | null = null; // NEW: Stream from AudioProcessor
    channelId: string | null = null;
    private selfUserId: string | null = null; // NEW
    private signal: (type: string, payload: any) => void = () => {};
    private pendingProduceCallbacks: Map<string, (params: { id: string }) => void> = new Map();
    private pendingConnectCallbacks: Map<string, { callback: () => void, errback: (error: Error) => void }> = new Map(); // NEW
    private pendingConsumers: any[] = []; // NEW: Queue for notifications before recvTransport is ready
    
    private onBrowserStreamCallback: ((stream: MediaStream) => void) | null = null;
    private onScreenShareStopCallback: (() => void) | null = null;
    private _closed: boolean = false;

    // Simple Event Emitter implementation
    private listeners: Map<string, Set<Function>> = new Map();

    on(event: string, fn: Function) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(fn);
    }

    off(event: string, fn: Function) {
        this.listeners.get(event)?.delete(fn);
    }

    private emit(event: string, ...args: any[]) {
        this.listeners.get(event)?.forEach(fn => fn(...args));
    }

    constructor() {}

    setUserId(userId: string) {
        this.selfUserId = userId;
    }

    setSignal(fn: (type: string, payload: any) => void) {
        this.signal = fn;
    }
    
    onScreenShareStopped(callback: () => void) {
        this.onScreenShareStopCallback = callback;
    }
    
    onSharedBrowserStream(callback: (stream: MediaStream) => void) {
        this.onBrowserStreamCallback = callback;
    }

    consume(producerId: string) {
        if (!this.recvTransport) {
            console.warn("SFU: RecvTransport not ready yet. Queueing consume?");
            return;
        }
        console.log(`[SFU] Manually consuming producer: ${producerId}`);
        this.signal(C2S_MSG_TYPE.MS_CONSUME, {
            transportId: this.recvTransport!.id,
            producerId,
            rtpCapabilities: this.device!.rtpCapabilities,
            channelId: this.channelId
        });
    }

    private handleTransportFailure() {
        if (this._closed || !this.channelId) return;
        console.warn("[SFU] Critical transport failure detected. Restarting Mediasoup session in 3 seconds...");
        const savedChannelId = this.channelId;
        this.leave();
        setTimeout(() => {
            if (savedChannelId) {
                console.log("[SFU] Re-joining channel after failure...");
                this.joinChannel(savedChannelId);
            }
        }, 3000);
    }

    async joinChannel(channelId: string) {
        console.log(`[SFU] joinChannel called for ${channelId}`);
        this._closed = false;
        this.channelId = channelId;
        this.signal(C2S_MSG_TYPE.MS_GET_ROUTER_RTP_CAPABILITIES, { channelId });
    }

    async onRouterRtpCapabilities({ routerRtpCapabilities }: any) {
        console.log('[SFU] Received Router RTP Capabilities');
        if (!this.device) {
            this.device = new mediasoupClient.Device();
        }
        
        if (!this.device.loaded) {
            try {
                await this.device.load({ routerRtpCapabilities });
                console.log('[SFU] Device loaded');
            } catch (error) {
                console.error('[SFU] Failed to load device:', error);
                return;
            }
        }

        console.log('[SFU] Requesting WebRTC Transports');
        this.signal(C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT, { channelId: this.channelId }); 
        this.signal(C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT, { channelId: this.channelId }); 
    }

    async onWebRtcTransportCreated(params: any) {
        console.log(`[SFU] Transport created: ${params.id}`);
        if (!this.sendTransport) {
            this.sendTransport = this.device!.createSendTransport(params);
            this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                console.log('[SFU] SendTransport connecting...');
                try {
                    this.pendingConnectCallbacks.set(this.sendTransport!.id, { callback, errback });
                    this.signal(C2S_MSG_TYPE.MS_CONNECT_TRANSPORT, { transportId: this.sendTransport!.id, dtlsParameters });
                } catch (error: any) {
                    console.error('[SFU] SendTransport connect error:', error);
                    errback(error);
                }
            });
            this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
                console.log(`[SFU] SendTransport producing ${kind}...`);
                try {
                    if (this._closed) throw new Error("SFU is closed");
                    this.signal(C2S_MSG_TYPE.MS_PRODUCE, { 
                        transportId: this.sendTransport!.id, 
                        kind, 
                        rtpParameters, 
                        appData,
                        channelId: this.channelId
                    });
                    const source = appData?.source || 'mic';
                    this.pendingProduceCallbacks.set(source, callback);
                } catch (error: any) {
                    console.error(`[SFU] SendTransport produce error (${kind}):`, error);
                    errback(error);
                }
            });

            this.sendTransport.on('connectionstatechange', (state) => {
                console.log(`[SFU] SendTransport state: ${state}`);
                this.emit('connectionStateChange', state);
                if (state === 'failed') {
                    console.error('[SFU] SendTransport FAILED. Attempting full re-join...');
                    this.handleTransportFailure();
                }
            });
            
            this.startAudio();

        } else if (!this.recvTransport) {
            this.recvTransport = this.device!.createRecvTransport(params);
            
            this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                console.log('[SFU] RecvTransport connecting...');
                try {
                    this.pendingConnectCallbacks.set(this.recvTransport!.id, { callback, errback });
                    this.signal(C2S_MSG_TYPE.MS_CONNECT_TRANSPORT, { transportId: this.recvTransport!.id, dtlsParameters });
                } catch (error: any) {
                    console.error('[SFU] RecvTransport connect error:', error);
                    errback(error);
                }
            });

            this.recvTransport.on('connectionstatechange', (state) => {
                console.log(`[SFU] RecvTransport state: ${state}`);
                this.emit('connectionStateChange', state);
                if (state === 'failed') {
                    console.error('[SFU] RecvTransport FAILED. Attempting full re-join...');
                    this.handleTransportFailure();
                }
            });

            console.log('[SFU] RecvTransport ready. Requesting existing producers...');
            this.signal(C2S_MSG_TYPE.MS_GET_EXISTING_PRODUCERS, { channelId: this.channelId });

            // Process any producers that were announced while we were creating the transport
            if (this.pendingConsumers.length > 0) {
                console.log(`[SFU] Processing ${this.pendingConsumers.length} queued producers.`);
                const queue = [...this.pendingConsumers];
                this.pendingConsumers = [];
                queue.forEach(item => this.onNewPeerProducer(item));
            }
        }
    }
    
    onProducerCreated({ id, source }: any) {
        console.log(`[SFU] Producer created on server: ${id}`);
        const sourceKey = source || 'mic';
        const callback = this.pendingProduceCallbacks.get(sourceKey);
        if (callback) {
            callback({ id });
            this.pendingProduceCallbacks.delete(sourceKey);
        }
    }

    onTransportConnected({ transportId }: any) {
        console.log(`[SFU] Transport connected on server: ${transportId}`);
        const cb = this.pendingConnectCallbacks.get(transportId);
        if (cb) {
            cb.callback();
            this.pendingConnectCallbacks.delete(transportId);
        }
    }

    async startAudio() {
        if (this.audioProducer && !this.audioProducer.closed) {
            console.log("[SFU] Audio producer already exists and is active, skipping creation.");
            return;
        }
        
        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport) {
            console.warn("SFU: Transport not ready, skipping audio start.");
            return;
        }

        try {
            // Get selected device from localStorage (synced with settings)
            const savedSettings = localStorage.getItem('murchat-settings');
            let deviceId = undefined;
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                deviceId = settings.inputDeviceId;
            }

            console.log(`[SFU] Starting audio with device: ${deviceId || 'default'}`);

            const rawStream = await navigator.mediaDevices.getUserMedia({ 
                audio: deviceId ? { deviceId: { exact: deviceId } } : true 
            });

            this.rawMicStream = rawStream;

            // Apply MurClear AI Processor
            const processedStream = await audioProcessor.processStream(rawStream);
            this.processedMicStream = processedStream; 

            if (this.selfUserId) {
                this.emit('newStream', { userId: this.selfUserId, stream: processedStream, appData: { source: 'mic' } });
            }

            // Visualization uses RAW stream for instant feedback
            webRTCService.setLocalStream(rawStream); 

            let track = processedStream.getAudioTracks()[0];

            // If track is not immediately available, wait a few frames (AudioWorklet startup)
            if (!track || track.readyState === 'ended') {
                console.log("[SFU] Waiting for AudioProcessor track to activate...");
                for (let i = 0; i < 15; i++) { // Increased wait time slightly
                    await new Promise(resolve => setTimeout(resolve, 200));
                    track = processedStream.getAudioTracks()[0];
                    if (track && track.readyState !== 'ended') break;
                }
            }

            if (!track || track.readyState === 'ended') {
                console.error("[SFU] Failed to acquire a valid audio track after waiting. Retrying processor reset...");
                // Force processor reset for next attempt
                await audioProcessor.processStream(rawStream);
                return;
            }

            console.log(`[SFU] Audio track ready: ${track.label} (${track.id})`);

            this.audioProducer = await this.sendTransport.produce({ 
                track, 
                codecOptions: {
                    opusStereo: true,
                    opusDtx: true,
                    opusFec: true
                },
                appData: { source: 'mic' } 
            });
        } catch (e) {
            console.error("SFU Audio Produce error:", e);
        }
    }

    async waitForTransport(): Promise<boolean> {
        if (this.sendTransport) return true;
        
        return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (this.sendTransport) {
                    clearInterval(interval);
                    resolve(true);
                } else if (attempts > 100) { 
                    clearInterval(interval);
                    resolve(false);
                }
            }, 100);
        });
    }

    async waitForChannel(): Promise<boolean> {
        if (this.channelId) return true;
        
        return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (this.channelId) {
                    clearInterval(interval);
                    resolve(true);
                } else if (attempts > 50) { // 5 seconds
                    clearInterval(interval);
                    resolve(false);
                }
            }, 100);
        });
    }

    async startVideo() {
        if (this.videoProducer && !this.videoProducer.closed) {
            console.warn("[SFU] Video producer already exists and is active.");
            return;
        }

        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport || this.sendTransport.closed) {
            console.error("SFU: Cannot start video - Transport not ready or closed.");
            return;
        }

        try {
            const savedSettings = localStorage.getItem('murchat-settings');
            let deviceId = undefined;
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                deviceId = settings.videoDeviceId;
            }

            console.log(`[SFU] Starting video with device: ${deviceId || 'default'}`);
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: deviceId ? { 
                    deviceId: { exact: deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } : { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            const track = stream.getVideoTracks()[0];
            
            if (this.selfUserId) {
                this.emit('newStream', { userId: this.selfUserId, stream, appData: { source: 'webcam' } });
            }

            if (!this.sendTransport || this.sendTransport.closed) {
                track.stop();
                return;
            }

            this.videoProducer = await this.sendTransport.produce({ 
                track, 
                appData: { source: 'webcam' } 
            });

            track.onended = () => {
                this.stopVideo();
            };

        } catch (e) {
            console.error("SFU Video Produce error:", e);
        }
    }

    stopVideo() {
        console.log("[SFU] stopVideo called");
        if (this.videoProducer) {
            this.videoProducer.close();
            this.signal(C2S_MSG_TYPE.MS_CLOSE_PRODUCER, { producerId: this.videoProducer.id });
            this.videoProducer = null;
        }
        
        // Notify UI to clear local video
        if (this.selfUserId) {
            this.emit('streamClosed', { userId: this.selfUserId, appData: { source: 'webcam' } });
        }
    }

    async startScreenShare(sourceId: string, options: { resolution: string, fps: number } = { resolution: '1080p', fps: 30 }) {
        if (this.screenProducer && !this.screenProducer.closed) {
            console.warn("[SFU] Screen share already active.");
            return;
        }

        if (!this.channelId) {
            const channelReady = await this.waitForChannel();
            if (!channelReady) return;
        }

        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport || this.sendTransport.closed) {
            console.error("SFU: Cannot start screen share - Transport not ready.");
            return;
        }

        try {
            let width, height;
            switch(options.resolution) {
                case '720p': width = 1280; height = 720; break;
                case '1440p': width = 2560; height = 1440; break;
                case '2160p': width = 3840; height = 2160; break;
                case '1080p': default: width = 1920; height = 1080; break;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                } as any,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: width,
                        maxWidth: width,
                        minHeight: height,
                        maxHeight: height,
                        minFrameRate: options.fps,
                        maxFrameRate: options.fps
                    }
                } as any
            });

            const track = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            
            console.log(`[ScreenShare] Stream acquired.`);

            if (this.selfUserId) {
                this.emit('newStream', { userId: this.selfUserId, stream, appData: { source: 'screen' } });
            }

            track.onended = () => {
                this.stopScreenShare();
            };

            webRTCService.setLocalStream(stream);

            try {
                if (this.sendTransport.closed) {
                    return;
                }

                this.screenProducer = await this.sendTransport.produce({ 
                    track, 
                    appData: { source: 'screen' } 
                });

                // Play start sound
                playScreenshareStart();

                if (audioTrack) {
                    this.screenAudioProducer = await this.sendTransport.produce({
                        track: audioTrack,
                        appData: { source: 'screen-audio' }
                    });
                }
            } catch (produceError: any) {
                console.error("SFU: Produce failed", produceError);
                track.stop();
            }
            
        } catch (e) {
            console.error("SFU Screen Share error:", e);
            alert("Не удалось начать демонстрацию экрана. Возможно, нет прав доступа или выбранное окно свернуто. Попробуйте выбрать 'Весь экран'.");
        }
    }

    stopScreenShare() {
        console.log("[SFU] stopScreenShare called");
        if (this.screenProducer) {
            this.screenProducer.close();
            this.signal(C2S_MSG_TYPE.MS_CLOSE_PRODUCER, { producerId: this.screenProducer.id });
            this.screenProducer = null;
        }
        if (this.screenAudioProducer) {
            this.screenAudioProducer.close();
            this.signal(C2S_MSG_TYPE.MS_CLOSE_PRODUCER, { producerId: this.screenAudioProducer.id });
            this.screenAudioProducer = null;
        }
        
        // Restore mic stream for UI
        if (this.processedMicStream && this.selfUserId) {
            webRTCService.setLocalStream(this.processedMicStream);
            this.emit('newStream', { userId: this.selfUserId, stream: this.processedMicStream, appData: { source: 'mic' } });
        }

        if (this.onScreenShareStopCallback) {
            this.onScreenShareStopCallback();
        }
    }

    async startBrowserShare(sourceId: string, options: { resolution: string, fps: number } = { resolution: '720p', fps: 30 }) {
        if (this.browserProducer && !this.browserProducer.closed) {
            console.warn("[SFU] Browser share already active.");
            return;
        }

        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport || this.sendTransport.closed) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: { chromeMediaSource: 'desktop' }
                } as any,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 1280,
                        maxWidth: 1280,
                        minHeight: 720,
                        maxHeight: 720,
                        minFrameRate: options.fps,
                        maxFrameRate: options.fps
                    }
                } as any
            });

            const track = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            track.onended = () => { this.stopBrowserShare(); };

            this.browserProducer = await this.sendTransport!.produce({ 
                track, 
                appData: { source: 'browser' }
            });

            if (audioTrack) {
                this.browserAudioProducer = await this.sendTransport!.produce({
                    track: audioTrack,
                    appData: { source: 'browser-audio' }
                });
            }
        } catch (e) {
            console.error("SFU Browser Share error:", e);
        }
    }

    stopBrowserShare() {
        console.log("[SFU] stopBrowserShare called");
        if (this.browserProducer) {
            this.browserProducer.close();
            this.signal(C2S_MSG_TYPE.MS_CLOSE_PRODUCER, { producerId: this.browserProducer.id });
            this.browserProducer = null;
        }
        if (this.browserAudioProducer) {
            this.browserAudioProducer.close();
            this.signal(C2S_MSG_TYPE.MS_CLOSE_PRODUCER, { producerId: this.browserAudioProducer.id });
            this.browserAudioProducer = null;
        }

        // Restore mic stream for UI
        if (this.processedMicStream && this.selfUserId) {
            webRTCService.setLocalStream(this.processedMicStream);
            this.emit('newStream', { userId: this.selfUserId, stream: this.processedMicStream, appData: { source: 'mic' } });
        }
    }

    muteAudio(muted: boolean) {
        if (this.audioProducer) {
            if (this.audioProducer.track) {
                this.audioProducer.track.enabled = !muted;
            }
            if (muted) {
                this.audioProducer.pause();
            } else {
                this.audioProducer.resume();
            }
        }
    }

    async onNewPeerProducer({ producerId, userId, appData }: any) {
        if (!this.recvTransport) {
            console.warn(`SFU: RecvTransport not ready yet for ${producerId} from ${userId}. Queueing.`);
            this.pendingConsumers.push({ producerId, userId, appData });
            return;
        }
        
        console.log(`[SFU] Consume producer: ${producerId} from ${userId} (${appData?.source || 'mic'})`);
        this.producerToUser.set(producerId, userId);
        if (appData) {
            this.producerAppData.set(producerId, appData);
        }
        this.signal(C2S_MSG_TYPE.MS_CONSUME, {
            transportId: this.recvTransport!.id,
            producerId,
            rtpCapabilities: this.device!.rtpCapabilities,
            channelId: this.channelId
        });
    }

    async onConsumerCreated({ id, producerId, kind, rtpParameters }: any) {
        const consumer = await this.recvTransport!.consume({
            id,
            producerId,
            kind,
            rtpParameters,
        });
        
        this.consumers.set(producerId, consumer);
        
        const { track } = consumer;
        const stream = new MediaStream([track]);
        
        const userId = this.producerToUser.get(producerId);
        const appData = this.producerAppData.get(producerId);

        if (appData && (appData.source === 'browser' || appData.source === 'browser-audio')) {
            console.log(`[SFU] Received Shared Browser stream from ${userId}`);
            if (this.onBrowserStreamCallback) {
                this.onBrowserStreamCallback(stream);
            }
        } else if (userId) {
            webRTCService.injectRemoteTrack(stream, userId, appData);
        }
        
        this.emit('newStream', { userId, stream, appData });

        // Explicitly resume consumer to ensure it's not paused by default
        try {
            this.signal(C2S_MSG_TYPE.MS_RESUME_CONSUMER, { producerId, channelId: this.channelId });
        } catch (e) {
            console.error("[SFU] Error signaling consumer resume:", e);
        }
    }

    onProducerClosed({ producerId }: { producerId: string }) {
        const consumer = this.consumers.get(producerId);
        if (consumer) {
            consumer.close();
            this.consumers.delete(producerId);
            
            const userId = this.producerToUser.get(producerId);
            const appData = this.producerAppData.get(producerId);
            
            if (userId && (!appData || (appData.source !== 'browser' && appData.source !== 'browser-audio'))) {
                webRTCService.removeRemoteTrack(userId, appData);
            }
            
            this.emit('streamClosed', { userId, appData });
            
            this.producerToUser.delete(producerId);
            this.producerAppData.delete(producerId);
        }
    }
    
    leave() {
        if (this._closed) return;
        this._closed = true;
        
        console.log('[SFU] Leaving channel and cleaning up...');
        
        // 1. Close Producers
        [this.audioProducer, this.videoProducer, this.screenProducer, this.screenAudioProducer, this.browserProducer, this.browserAudioProducer].forEach(p => {
            if (p && !p.closed) p.close();
        });

        // 2. Close Consumers
        this.consumers.forEach(c => {
            if (!c.closed) c.close();
        });
        this.consumers.clear();

        // 3. Close Transports
        if (this.sendTransport && !this.sendTransport.closed) this.sendTransport.close();
        if (this.recvTransport && !this.recvTransport.closed) this.recvTransport.close();

        // 4. Nullify everything
        this.sendTransport = null;
        this.recvTransport = null;
        this.audioProducer = null;
        this.videoProducer = null;
        this.screenProducer = null;
        this.screenAudioProducer = null;
        this.browserProducer = null;
        this.browserAudioProducer = null;
        this.pendingProduceCallbacks.clear();
        this.pendingConnectCallbacks.clear();
        this.channelId = null; 
        this.producerToUser.clear();
        this.producerAppData.clear();
        
        if (this.rawMicStream) {
            this.rawMicStream.getTracks().forEach(t => t.stop());
            this.rawMicStream = null;
        }
        this.processedMicStream = null;
        // Keep device alive for faster re-join
    }
}

export const mediasoupService = new MediasoupService();