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
    videoProducer: mediasoupClient.types.Producer | null = null;
    screenProducer: mediasoupClient.types.Producer | null = null;
    screenAudioProducer: mediasoupClient.types.Producer | null = null;
    browserProducer: mediasoupClient.types.Producer | null = null;
    browserAudioProducer: mediasoupClient.types.Producer | null = null;
    consumers: Map<string, mediasoupClient.types.Consumer> = new Map();
    producerToUser: Map<string, string> = new Map();
    producerAppData: Map<string, any> = new Map();
    
    private rawMicStream: MediaStream | null = null;
    private processedMicStream: MediaStream | null = null;
    channelId: string | null = null;
    private selfUserId: string | null = null;
    private signal: (type: string, payload: any) => void = () => {};
    private pendingProduceCallbacks: Map<string, (params: { id: string }) => void> = new Map();
    private pendingConnectCallbacks: Map<string, { callback: () => void, errback: (error: Error) => void }> = new Map();
    private pendingConsumers: any[] = [];
    
    private onBrowserStreamCallback: ((stream: MediaStream) => void) | null = null;
    private onScreenShareStopCallback: (() => void) | null = null;
    private _closed: boolean = false;

    private listeners: Map<string, Set<Function>> = new Map();

    on(event: string, fn: Function) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(fn);
    }

    off(event: string, fn: Function) {
        this.listeners.get(event)?.delete(fn);
    }

    removeAllListeners(event?: string) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
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
        if (!this.recvTransport) return;
        this.signal(C2S_MSG_TYPE.MS_CONSUME, {
            transportId: this.recvTransport.id,
            producerId,
            rtpCapabilities: this.device!.rtpCapabilities,
            channelId: this.channelId
        });
    }

    private handleTransportFailure() {
        if (this._closed || !this.channelId) return;
        console.warn("[SFU] Critical transport failure. Restarting in 3s...");
        const savedChannelId = this.channelId;
        this.leave();
        setTimeout(() => {
            if (savedChannelId) this.joinChannel(savedChannelId);
        }, 3000);
    }

    async joinChannel(channelId: string) {
        this._closed = false;
        this.channelId = channelId;
        this.signal(C2S_MSG_TYPE.MS_GET_ROUTER_RTP_CAPABILITIES, { channelId });
    }

    async onRouterRtpCapabilities({ routerRtpCapabilities }: any) {
        if (!this.device) this.device = new mediasoupClient.Device();
        if (!this.device.loaded) {
            try {
                await this.device.load({ routerRtpCapabilities });
            } catch (error) {
                console.error('[SFU] Device load failed:', error);
                return;
            }
        }
        this.signal(C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT, { channelId: this.channelId }); 
        this.signal(C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT, { channelId: this.channelId }); 
    }

    async onWebRtcTransportCreated(params: any) {
        if (!this.sendTransport) {
            this.sendTransport = this.device!.createSendTransport(params);
            
            this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                this.pendingConnectCallbacks.set(this.sendTransport!.id, { callback, errback });
                this.signal(C2S_MSG_TYPE.MS_CONNECT_TRANSPORT, { transportId: this.sendTransport!.id, dtlsParameters });
            });

            this.sendTransport.on('produce', (args, callback, errback) => {
                try {
                    const { kind, rtpParameters, appData } = args;
                    this.signal(C2S_MSG_TYPE.MS_PRODUCE, { 
                        transportId: this.sendTransport!.id, 
                        kind, rtpParameters, appData, 
                        channelId: this.channelId 
                    });
                    if (typeof callback === 'function') {
                        this.pendingProduceCallbacks.set(appData?.source || 'mic', callback);
                    }
                } catch (error: any) { 
                    if (typeof errback === 'function') errback(error);
                }
            });

            this.sendTransport.on('connectionstatechange', (state) => {
                if (state === 'failed') this.handleTransportFailure();
                this.emit('connectionStateChange', state);
            });

            this.startAudio();
        } else if (!this.recvTransport) {
            this.recvTransport = this.device!.createRecvTransport(params);
            
            this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                this.pendingConnectCallbacks.set(this.recvTransport!.id, { callback, errback });
                this.signal(C2S_MSG_TYPE.MS_CONNECT_TRANSPORT, { transportId: this.recvTransport!.id, dtlsParameters });
            });

            this.recvTransport.on('connectionstatechange', (state) => {
                if (state === 'failed') this.handleTransportFailure();
                this.emit('connectionStateChange', state);
            });

            this.signal(C2S_MSG_TYPE.MS_GET_EXISTING_PRODUCERS, { channelId: this.channelId });
            if (this.pendingConsumers.length > 0) {
                const queue = [...this.pendingConsumers];
                this.pendingConsumers = [];
                queue.forEach(item => this.onNewPeerProducer(item));
            }
        }
    }
    
    onProducerCreated({ id, source }: any) {
        const callback = this.pendingProduceCallbacks.get(source || 'mic');
        if (callback && typeof callback === 'function') {
            callback({ id });
            this.pendingProduceCallbacks.delete(source || 'mic');
        }
    }

    onTransportConnected({ transportId }: any) {
        const cb = this.pendingConnectCallbacks.get(transportId);
        if (cb && cb.callback && typeof cb.callback === 'function') {
            cb.callback();
            this.pendingConnectCallbacks.delete(transportId);
        }
    }

    async startAudio() {
        if (this.audioProducer && !this.audioProducer.closed) return;
        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport) return;

        try {
            const savedSettings = localStorage.getItem('murchat-settings');
            const deviceId = savedSettings ? JSON.parse(savedSettings).inputDeviceId : undefined;
            const rawStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            this.rawMicStream = rawStream;
            const processedStream = await audioProcessor.processStream(rawStream);
            this.processedMicStream = processedStream; 

            if (this.selfUserId) this.emit('newStream', { userId: this.selfUserId, stream: processedStream, appData: { source: 'mic' } });
            webRTCService.setLocalStream(rawStream); 

            let track = processedStream.getAudioTracks()[0];
            if (!track || track.readyState === 'ended') {
                for (let i = 0; i < 15; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    track = processedStream.getAudioTracks()[0];
                    if (track && track.readyState !== 'ended') break;
                }
            }

            if (!track || track.readyState === 'ended') return;

            this.audioProducer = await this.sendTransport.produce({ 
                track, 
                codecOptions: { opusStereo: true, opusDtx: true, opusFec: true },
                appData: { source: 'mic' } 
            });
        } catch (e) { console.error("SFU Audio error:", e); }
    }

    async startVideo() {
        if (this.videoProducer && !this.videoProducer.closed) return;
        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport || (this.sendTransport as any).closed) return;

        try {
            const savedSettings = localStorage.getItem('murchat-settings');
            const deviceId = savedSettings ? JSON.parse(savedSettings).videoDeviceId : undefined;
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } } 
            });
            const track = stream.getVideoTracks()[0];
            if (this.selfUserId) this.emit('newStream', { userId: this.selfUserId, stream, appData: { source: 'webcam' } });
            this.videoProducer = await this.sendTransport.produce({ track, appData: { source: 'webcam' } });
            track.onended = () => this.stopVideo();
        } catch (e) { console.error("SFU Video error:", e); }
    }

    stopVideo() {
        if (this.videoProducer) {
            this.videoProducer.close();
            this.signal(C2S_MSG_TYPE.MS_CLOSE_PRODUCER, { producerId: this.videoProducer.id });
            this.videoProducer = null;
        }
        if (this.selfUserId) this.emit('streamClosed', { userId: this.selfUserId, appData: { source: 'webcam' } });
    }

    async startScreenShare(sourceId: string, options: { resolution: string, fps: number } = { resolution: '1080p', fps: 30 }) {
        if (this.screenProducer && !this.screenProducer.closed) return;
        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport || (this.sendTransport as any).closed) return;

        try {
            let width = 1920, height = 1080;
            if (options.resolution === '720p') { width = 1280; height = 720; }
            
            // Fixed constraints: Use modern flat object structure instead of mandatory/optional
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                } as any,
                video: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    width: { ideal: width },
                    height: { ideal: height },
                    frameRate: { ideal: options.fps }
                } as any
            });
            
            const track = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            
            if (this.selfUserId) this.emit('newStream', { userId: this.selfUserId, stream, appData: { source: 'screen' } });
            track.onended = () => this.stopScreenShare();
            
            const transport = this.sendTransport as any;
            if (!transport || transport.closed) { 
                stream.getTracks().forEach(t => t.stop()); 
                return; 
            }

            this.screenProducer = await transport.produce({ track, appData: { source: 'screen' } });
            playScreenshareStart();
            
            if (audioTrack && !transport.closed) {
                this.screenAudioProducer = await transport.produce({ 
                    track: audioTrack, 
                    appData: { source: 'screen-audio' } 
                });
            }
        } catch (e) { console.error("SFU Screen error:", e); }
    }

    stopScreenShare() {
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
        if (this.processedMicStream && this.selfUserId) {
            webRTCService.setLocalStream(this.processedMicStream);
            this.emit('newStream', { userId: this.selfUserId, stream: this.processedMicStream, appData: { source: 'mic' } });
        }
        if (this.onScreenShareStopCallback) this.onScreenShareStopCallback();
    }

    async startBrowserShare(sourceId: string, options: { resolution: string, fps: number } = { resolution: '720p', fps: 30 }) {
        if (this.browserProducer && !this.browserProducer.closed) return;
        const ready = await this.waitForTransport();
        if (!ready || !this.sendTransport || (this.sendTransport as any).closed) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { mandatory: { chromeMediaSource: 'desktop' } } as any,
                video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: 1280, maxWidth: 1280, minHeight: 720, maxHeight: 720, minFrameRate: options.fps, maxFrameRate: options.fps } } as any
            });
            const track = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            track.onended = () => this.stopBrowserShare();
            const transport = this.sendTransport as any;
            if (!transport || transport.closed) { stream.getTracks().forEach(t => t.stop()); return; }
            this.browserProducer = await transport.produce({ track, appData: { source: 'browser' } });
            if (audioTrack && !transport.closed) this.browserAudioProducer = await transport.produce({ track: audioTrack, appData: { source: 'browser-audio' } });
        } catch (e) { console.error("SFU Browser error:", e); }
    }

    stopBrowserShare() {
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
        if (this.processedMicStream && this.selfUserId) {
            webRTCService.setLocalStream(this.processedMicStream);
            this.emit('newStream', { userId: this.selfUserId, stream: this.processedMicStream, appData: { source: 'mic' } });
        }
    }

    muteAudio(muted: boolean) {
        if (this.audioProducer) {
            if (this.audioProducer.track) this.audioProducer.track.enabled = !muted;
            if (muted) this.audioProducer.pause(); else this.audioProducer.resume();
        }
    }

    async onNewPeerProducer({ producerId, userId, appData }: any) {
        if (!this.recvTransport) {
            this.pendingConsumers.push({ producerId, userId, appData });
            return;
        }
        this.producerToUser.set(producerId, userId);
        if (appData) this.producerAppData.set(producerId, appData);
        this.signal(C2S_MSG_TYPE.MS_CONSUME, { transportId: this.recvTransport.id, producerId, rtpCapabilities: this.device!.rtpCapabilities, channelId: this.channelId });
    }

    async onConsumerCreated({ id, producerId, kind, rtpParameters }: any) {
        if (!this.recvTransport || this.recvTransport.closed) return;
        const consumer = await this.recvTransport.consume({ id, producerId, kind, rtpParameters });
        this.consumers.set(producerId, consumer);
        const stream = new MediaStream([consumer.track]);
        const userId = this.producerToUser.get(producerId);
        const appData = this.producerAppData.get(producerId);

        if (appData && (appData.source === 'browser' || appData.source === 'browser-audio')) {
            if (this.onBrowserStreamCallback) this.onBrowserStreamCallback(stream);
        } else if (userId) {
            webRTCService.injectRemoteTrack(stream, userId, appData);
        }
        this.emit('newStream', { userId, stream, appData });
        this.signal(C2S_MSG_TYPE.MS_RESUME_CONSUMER, { producerId, channelId: this.channelId });
    }

    onProducerClosed({ producerId }: { producerId: string }) {
        const consumer = this.consumers.get(producerId);
        if (consumer) {
            consumer.close();
            this.consumers.delete(producerId);
            const userId = this.producerToUser.get(producerId);
            const appData = this.producerAppData.get(producerId);
            if (userId && (!appData || (appData.source !== 'browser' && appData.source !== 'browser-audio'))) webRTCService.removeRemoteTrack(userId, appData);
            this.emit('streamClosed', { userId, appData });
            this.producerToUser.delete(producerId);
            this.producerAppData.delete(producerId);
        }
    }
    
    leave() {
        if (this._closed) return;
        this._closed = true;
        [this.audioProducer, this.videoProducer, this.screenProducer, this.screenAudioProducer, this.browserProducer, this.browserAudioProducer].forEach(p => { if (p && !p.closed) p.close(); });
        this.consumers.forEach(c => { if (!c.closed) c.close(); });
        this.consumers.clear();
        try {
          if (this.sendTransport) {
            this.sendTransport.close();
            this.sendTransport = null;
          }
          if (this.recvTransport) {
            this.recvTransport.close();
            this.recvTransport = null;
          }
        } catch (e) {}
        this.audioProducer = null; this.videoProducer = null;
        this.screenProducer = null; this.screenAudioProducer = null;
        this.browserProducer = null; this.browserAudioProducer = null;
        this.pendingProduceCallbacks.clear(); this.pendingConnectCallbacks.clear();
        this.channelId = null; this.producerToUser.clear(); this.producerAppData.clear();
        if (this.rawMicStream) { this.rawMicStream.getTracks().forEach(t => t.stop()); this.rawMicStream = null; }
        this.processedMicStream = null;
    }

    async waitForTransport(): Promise<boolean> {
        if (this.sendTransport) return true;
        return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (this.sendTransport) { clearInterval(interval); resolve(true); }
                else if (attempts > 50) { clearInterval(interval); resolve(false); }
            }, 100);
        });
    }

    async waitForChannel(): Promise<boolean> {
        if (this.channelId) return true;
        return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (this.channelId) { clearInterval(interval); resolve(true); }
                else if (attempts > 50) { clearInterval(interval); resolve(false); }
            }, 100);
        });
    }
}

export const mediasoupService = new MediasoupService();
