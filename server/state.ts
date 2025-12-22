import { WebSocket } from 'ws';
import { UserActivity } from '../murchat/common/types.js'; // NEW

// Store connected clients and their associated user IDs
export const clients = new Map<WebSocket, string>();
export const userConnections = new Map<string, WebSocket>();
export const clientStates = new Map<string, { selectedServerId: string | null; activity?: UserActivity | null }>(); // UPDATED

// Store voice channel members (ephemeral state)
export const voiceChannels = new Map<string, Set<string>>();

// Shared Browser Sessions
export interface SharedBrowserState {
    channelId: string;
    ownerId: string;
    url: string;
    producerId?: string; 
}
export const activeBrowsers = new Map<string, SharedBrowserState>();

// Mediasoup Data Storage
export interface PeerMediasoupData {
    transports: Map<string, any>;
    producers: Map<string, any>;
    consumers: Map<string, any>;
}
export const peerMediasoupData = new Map<string, PeerMediasoupData>();
