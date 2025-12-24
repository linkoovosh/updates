import * as mediasoup from 'mediasoup';
import { config } from './config.js';

class MediasoupManager {
    workers: mediasoup.types.Worker[] = [];
    nextWorkerIndex = 0;
    routers: Map<string, mediasoup.types.Router> = new Map(); // roomId (channelId) -> Router
    
    private initPromise: Promise<void> | null = null;

    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            console.log('Initializing Mediasoup Workers...');
            try {
                for (let i = 0; i < config.mediasoup.numWorkers; i++) {
                    const worker = await mediasoup.createWorker({
                        logLevel: config.mediasoup.worker.logLevel as any,
                        logTags: config.mediasoup.worker.logTags as any,
                        rtcMinPort: config.mediasoup.worker.rtcMinPort,
                        rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
                    });

                    worker.on('died', () => {
                        console.error(`Mediasoup Worker ${worker.pid} died!`);
                        setTimeout(() => process.exit(1), 2000);
                    });

                    this.workers.push(worker);
                }
                console.log(`Mediasoup initialized with ${this.workers.length} workers.`);
            } catch (e) {
                console.error("Failed to init mediasoup workers:", e);
                this.initPromise = null; // Allow retry
            }
        })();

        return this.initPromise;
    }

    async getWorker() {
        await this.init(); // Ensure initialized
        if (this.workers.length === 0) throw new Error("No Mediasoup workers available");
        
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
        return worker;
    }

    async getOrCreateRouter(roomId: string) {
        let router = this.routers.get(roomId);
        if (!router) {
            const worker = await this.getWorker();
            router = await worker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs as any });
            this.routers.set(roomId, router);
            console.log(`Created Router for room ${roomId} on worker ${worker.pid}`);
        }
        return router;
    }
    
    async createWebRtcTransport(router: mediasoup.types.Router) {
        const transport = await router.createWebRtcTransport({
            listenIps: config.mediasoup.webRtcTransport.listenIps,
            initialAvailableOutgoingBitrate: config.mediasoup.webRtcTransport.initialAvailableOutgoingBitrate,
            enableUdp: true,
            enableTcp: true, // FALLBACK TO TCP IF UDP FAILS
            preferUdp: true,
        });
        
        if (config.mediasoup.webRtcTransport.maxIncomingBitrate) {
            try {
                await transport.setMaxIncomingBitrate(config.mediasoup.webRtcTransport.maxIncomingBitrate);
            } catch (error) {}
        }

        return {
            transport,
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        };
    }

    async createPlainTransport(router: mediasoup.types.Router) {
        const transport = await router.createPlainTransport({
            listenIp: config.mediasoup.webRtcTransport.listenIps[0].ip, // Use same IP config
            rtcpMux: true,
            comedia: true
        });

        return transport;
    }
}

export const mediasoupManager = new MediasoupManager();
