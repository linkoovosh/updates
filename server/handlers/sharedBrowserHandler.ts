import { prisma } from '../prisma.js'; // NEW
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { clients, userConnections, voiceChannels, activeBrowsers } from '../state.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    StartSharedBrowserPayload,
    SharedBrowserStartedPayload,
    StopSharedBrowserPayload,
    SharedBrowserStoppedPayload,
    SharedBrowserInputPayload
} from '../../murchat/common/types.js';

export async function handleSharedBrowserMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    // const db = getDb(); // Not used directly, but good to have available

    // --- Shared Browser Logic (Client-Hosted) ---
    if (parsedMessage.type === C2S_MSG_TYPE.START_SHARED_BROWSER) {
        const payload = parsedMessage.payload as StartSharedBrowserPayload;
        
        if (activeBrowsers.has(payload.channelId)) {
            return true;
        }

        activeBrowsers.set(payload.channelId, {
            channelId: payload.channelId,
            ownerId: userId,
            url: payload.url || 'https://google.com'
        });

        console.log(`[SharedBrowser] Started by ${userId} in ${payload.channelId}`);
        
        const startedMsg: WebSocketMessage<SharedBrowserStartedPayload> = {
            type: S2C_MSG_TYPE.SHARED_BROWSER_STARTED,
            payload: {
                channelId: payload.channelId,
                producerId: '',
                url: payload.url || 'https://google.com',
                ownerId: userId
            }
        };

        const members = voiceChannels.get(payload.channelId);
        if (members) {
            members.forEach(memberId => {
                const memberWs = userConnections.get(memberId);
                if (memberWs && memberWs.readyState === WebSocket.OPEN) {
                    memberWs.send(JSON.stringify(startedMsg));
                }
            });
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.STOP_SHARED_BROWSER) {
        const payload = parsedMessage.payload as StopSharedBrowserPayload;
        const browserState = activeBrowsers.get(payload.channelId);
        
        if (browserState && browserState.ownerId === userId) {
            activeBrowsers.delete(payload.channelId);
            console.log(`[SharedBrowser] Stopped by ${userId}`);

            const members = voiceChannels.get(payload.channelId);
            if (members) {
                const stoppedMsg: WebSocketMessage<SharedBrowserStoppedPayload> = {
                    type: S2C_MSG_TYPE.SHARED_BROWSER_STOPPED,
                    payload: { channelId: payload.channelId }
                };
                members.forEach(memberId => {
                    const memberWs = userConnections.get(memberId);
                    if (memberWs) memberWs.send(JSON.stringify(stoppedMsg));
                });
            }
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.SHARED_BROWSER_INPUT) {
        const payload = parsedMessage.payload as SharedBrowserInputPayload;
        const browserState = activeBrowsers.get(payload.channelId);
        
        if (browserState) {
            const ownerWs = userConnections.get(browserState.ownerId);
            if (ownerWs && ownerWs.readyState === WebSocket.OPEN) {
                const inputMsg: WebSocketMessage<SharedBrowserInputPayload> = {
                    type: C2S_MSG_TYPE.SHARED_BROWSER_INPUT,
                    payload: payload
                };
                ownerWs.send(JSON.stringify(inputMsg));
            }
        }
        return true;
    }

    return false;
}
