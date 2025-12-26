import { WebSocket } from 'ws';
import { UserActivity } from '../murchat/common/types.js'; // NEW

// Store connected clients and their associated user IDs
export const clients = new Map<WebSocket, string>();
export const userConnections = new Map<string, WebSocket>();
export const clientStates = new Map<string, { selectedServerId: string | null; activity?: UserActivity | null }>(); // UPDATED

// Store voice channel members (ephemeral state)
export const voiceChannels = new Map<string, Set<string>>();

// Track manually granted developers (ephemeral state for /dev list)
export const temporaryDevelopers = new Set<string>();

// Cache for Server Members (ServerID -> Set<UserID>) to optimize message broadcasting
export const serverMembersCache = new Map<string, Set<string>>();

// Server Error Log (Ring Buffer)
export const serverErrors: { timestamp: number; message: string }[] = [];
export const serverStartTime = Date.now();

export function logServerError(message: string) {
    console.error(message); // Keep console logging
    serverErrors.unshift({ timestamp: Date.now(), message }); // Add to front
    if (serverErrors.length > 50) serverErrors.pop(); // Keep only last 50
}

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
