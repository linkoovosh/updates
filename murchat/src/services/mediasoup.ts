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
    
    // Safety queues for production minification fix
    private produceCallback: any = null;
    private connectCallbacks: Map<string, any> = new Map();
    
    private onBrowserStreamCallback: ((stream: MediaStream) => void) | null = null;
    private onScreenShareStopCallback: (() => void) | null = null;
    private _closed: boolean = false;
    private isRestarting = false;

    private listeners: Map<string, Set<Function>> = new Map();

    on(event: string, fn: Function) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(fn);
    }

    off(event: string, fn: Function) {
        this.listeners.get(event)?.delete(fn);
    }

    removeAllListeners(event?: string) {
        if (event) this.listeners.delete(event); else this.listeners.clear();
    }

    private emit(event: string, ...args: any[]) {
        this.listeners.get(event)?.forEach(fn => fn(...args));
    }

    setUserId(userId: string) { this.selfUserId = userId; }
    setSignal(fn: (type: string, payload: any) => void) { this.signal = fn; }
    onScreenShareStopped(callback: () => void) { this.onScreenShareStopCallback = callback; }
    onSharedBrowserStream(callback: (stream: MediaStream) => void) { this.onBrowserStreamCallback = callback; }

    private handleTransportFailure() {
        if (this._closed || !this.channelId || this.isRestarting) return;
        this.isRestarting = true;
        console.warn("[SFU] Transport failure. Restarting...");
        const savedChannelId = this.channelId;
        this.leave();
        setTimeout(() => {
            this.isRestarting = false;
            if (savedChannelId && !this._closed) this.joinChannel(savedChannelId);
        }, 3000);
    }

    async joinChannel(channelId: string) {
        this._closed = false;
        this.channelId = channelId;
        this.signal(C2S_MSG_TYPE.MS_GET_ROUTER_RTP_CAPABILITIES, { channelId });
    }

    async onRouterRtpCapabilities({ routerRtpCapabilities }: any) {
        if (!this.device) this.device = new mediasoupClient.Device();
        if (!this.device.loaded) await this.device.load({ routerRtpCapabilities });
        this.signal(C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT, { channelId: this.channelId }); 
        this.signal(C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT, { channelId: this.channelId }); 
    }

    async onWebRtcTransportCreated(params: any) {
        if (!this.sendTransport) {
            this.sendTransport = this.device!.createSendTransport(params);
            this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                this.connectCallbacks.set(this.sendTransport!.id, callback);
                this.signal(C2S_MSG_TYPE.MS_CONNECT_TRANSPORT, { transportId: this.sendTransport!.id, dtlsParameters });
            });
            this.sendTransport.on('produce', (args, callback, errback) => {
                this.produceCallback = callback;
                this.signal(C2S_MSG_TYPE.MS_PRODUCE, { transportId: this.sendTransport!.id, ...args, channelId: this.channelId });
            });
            this.sendTransport.on('connectionstatechange', (state) => {
                if (state === 'failed') this.handleTransportFailure();
                this.emit('connectionStateChange', state);
            });
            this.startAudio();
        } else if (!this.recvTransport) {
            this.recvTransport = this.device!.createRecvTransport(params);
            this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                this.connectCallbacks.set(this.recvTransport!.id, callback);
                this.signal(C2S_MSG_TYPE.MS_CONNECT_TRANSPORT, { transportId: this.recvTransport!.id, dtlsParameters });
            });
            this.recvTransport.on('connectionstatechange', (state) => {
                if (state === 'failed') this.handleTransportFailure();
                this.emit('connectionStateChange', state);
            });
            this.signal(C2S_MSG_TYPE.MS_GET_EXISTING_PRODUCERS, { channelId: this.channelId });
        }
    }
    
    onProducerCreated({ id }: any) {
        if (this.produceCallback) {
            this.produceCallback({ id });
            this.produceCallback = null;
        }
    }

    onTransportConnected({ transportId }: any) {
        const cb = this.connectCallbacks.get(transportId);
        if (cb) {
            cb();
            this.connectCallbacks.delete(transportId);
        }
    }

    async startAudio() {
        if (this.audioProducer) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
            this.rawMicStream = stream;
            const processed = await audioProcessor.processStream(stream);
            this.processedMicStream = processed;
            if (this.selfUserId) this.emit('newStream', { userId: this.selfUserId, stream: processed, appData: { source: 'mic' } });
            const track = processed.getAudioTracks()[0];
            this.audioProducer = await this.sendTransport!.produce({ track, appData: { source: 'mic' } });
        } catch (e) { console.error(e); }
    }

    leave() {
        this._closed = true;
        [this.audioProducer, this.videoProducer, this.screenProducer, this.screenAudioProducer].forEach(p => p?.close());
        this.consumers.forEach(c => c.close());
        this.consumers.clear();
        this.sendTransport?.close();
        this.recvTransport?.close();
        this.sendTransport = null; this.recvTransport = null;
        this.audioProducer = null; this.videoProducer = null;
        this.connectCallbacks.clear(); this.produceCallback = null;
        if (this.rawMicStream) this.rawMicStream.getTracks().forEach(t => t.stop());
    }

    async onNewPeerProducer({ producerId, userId, appData }: any) {
        if (!this.recvTransport) return;
        this.producerToUser.set(producerId, userId);
        this.producerAppData.set(producerId, appData);
        this.signal(C2S_MSG_TYPE.MS_CONSUME, { transportId: this.recvTransport.id, producerId, rtpCapabilities: this.device!.rtpCapabilities, channelId: this.channelId });
    }

    async onConsumerCreated({ id, producerId, kind, rtpParameters }: any) {
        if (!this.recvTransport) return;
        const consumer = await this.recvTransport.consume({ id, producerId, kind, rtpParameters });
        this.consumers.set(producerId, consumer);
        const stream = new MediaStream([consumer.track]);
        const userId = this.producerToUser.get(producerId);
        const appData = this.producerAppData.get(producerId);
        if (userId) webRTCService.injectRemoteTrack(stream, userId, appData);
        this.emit('newStream', { userId, stream, appData });
        this.signal(C2S_MSG_TYPE.MS_RESUME_CONSUMER, { producerId, channelId: this.channelId });
    }
}

export const mediasoupService = new MediasoupService();