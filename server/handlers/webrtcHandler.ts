import { WebSocket } from 'ws';
import { prisma } from '../prisma.js'; // NEW
import { clients, userConnections, peerMediasoupData, voiceChannels } from '../state.js';
import { mediasoupManager } from '../mediasoup-handler.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    WebRtcJoinVoiceChannelPayload,
    WebRtcUserJoinedVoiceChannelPayload,
    WebRtcExistingMembersPayload,
    WebRtcLeaveVoiceChannelPayload,
    WebRtcUserLeftVoiceChannelPayload,
    WebRtcOfferPayload,
    WebRtcOfferPayloadS2C,
    WebRtcAnswerPayload,
    WebRtcAnswerPayloadS2C,
    WebRtcIceCandidatePayload,
    WebRtcIceCandidatePayloadS2C,
    User
} from '../../murchat/common/types.js';

export async function handleWebRTCMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    // const db = getDb();

    // Mediasoup SFU Signaling
    const msgType = (parsedMessage && typeof parsedMessage.type === 'string') ? parsedMessage.type : '';
    
    if (msgType.startsWith('MS_')) { 
        if (!peerMediasoupData.has(userId)) {
            peerMediasoupData.set(userId, {
                transports: new Map(),
                producers: new Map(),
                consumers: new Map()
            });
        }
        const peerData = peerMediasoupData.get(userId)!;

        if (msgType === C2S_MSG_TYPE.MS_GET_ROUTER_RTP_CAPABILITIES) {
            const { channelId } = parsedMessage.payload as any;
            const router = await mediasoupManager.getOrCreateRouter(channelId);
            ws.send(JSON.stringify({
                type: S2C_MSG_TYPE.MS_ROUTER_RTP_CAPABILITIES,
                payload: { routerRtpCapabilities: router.rtpCapabilities }
            }));
            return true;
        }
        
        else if (msgType === C2S_MSG_TYPE.MS_CREATE_WEBRTC_TRANSPORT) {
            const { channelId } = parsedMessage.payload as any;
            const router = await mediasoupManager.getOrCreateRouter(channelId);
            
            const { transport, params } = await mediasoupManager.createWebRtcTransport(router);
            peerData.transports.set(transport.id, transport);

            transport.on('icestatechange', (iceState) => {
                console.log(`[SFU] Transport ${transport.id} ICE state: ${iceState} (User: ${userId})`);
            });

            transport.on('dtlsstatechange', (dtlsState) => {
                console.log(`[SFU] Transport ${transport.id} DTLS state: ${dtlsState} (User: ${userId})`);
                if (dtlsState === 'failed' || dtlsState === 'closed') {
                    console.warn(`[SFU] Transport ${transport.id} DTLS FAILED/CLOSED`);
                }
            });
            
            ws.send(JSON.stringify({
                type: S2C_MSG_TYPE.MS_WEBRTC_TRANSPORT_CREATED,
                payload: params
            }));
            return true;
        }
        
        else if (msgType === C2S_MSG_TYPE.MS_CONNECT_TRANSPORT) {
            const { transportId, dtlsParameters } = parsedMessage.payload as any;
            const transport = peerData.transports.get(transportId);
            if (transport) {
                await transport.connect({ dtlsParameters });
                // Send confirmation back to client
                ws.send(JSON.stringify({
                    type: S2C_MSG_TYPE.MS_TRANSPORT_CONNECTED,
                    payload: { transportId }
                }));
            }
            return true;
        }
        
        else if (msgType === C2S_MSG_TYPE.MS_PRODUCE) {
            const { transportId, kind, rtpParameters, appData, channelId } = parsedMessage.payload as any;
            const transport = peerData.transports.get(transportId);
            if (transport) {
                const producer = await transport.produce({ kind, rtpParameters, appData });
                peerData.producers.set(producer.id, producer);
                
                const source = appData?.source || 'mic';
                console.log(`[SFU] User ${userId} producing ${kind} (${source}) in channel ${channelId}`);
                
                ws.send(JSON.stringify({
                    type: S2C_MSG_TYPE.MS_PRODUCER_CREATED,
                    payload: { id: producer.id, source } 
                }));
                
                // Notify others about the new producer
                const members = voiceChannels.get(channelId);
                if (members) {
                    members.forEach(memberId => {
                        if (memberId !== userId) {
                            const memberWs = userConnections.get(memberId);
                            if (memberWs) {
                                console.log(`[SFU] Notifying peer ${memberId} about new producer ${producer.id} from ${userId} (${source})`);
                                memberWs.send(JSON.stringify({
                                    type: S2C_MSG_TYPE.MS_NEW_PEER_PRODUCER,
                                    payload: { producerId: producer.id, userId: userId, appData: producer.appData }
                                }));
                            }
                        }
                    });
                }

                // If screen share, update voice state for everyone
                if (appData && appData.source === 'screen') {
                    const voiceStateUpdateMsg: WebSocketMessage<any> = {
                        type: S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE,
                        payload: { userId, channelId, isScreenSharing: true }
                    };
                    clients.forEach((_, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify(voiceStateUpdateMsg));
                        }
                    });
                }
            }
            return true;
        }

        else if (msgType === C2S_MSG_TYPE.MS_GET_EXISTING_PRODUCERS) {
            const { channelId } = parsedMessage.payload as any;
            console.log(`[SFU] Sending existing producers to ${userId} in channel ${channelId}`);
            
            const members = voiceChannels.get(channelId);
            if (members) {
                members.forEach(memberId => {
                    if (memberId !== userId) {
                        const otherPeerData = peerMediasoupData.get(memberId);
                        if (otherPeerData && otherPeerData.producers.size > 0) {
                            otherPeerData.producers.forEach(producer => {
                                console.log(`[SFU] Notifying ${userId} about existing producer ${producer.id} from ${memberId}`);
                                ws.send(JSON.stringify({
                                    type: S2C_MSG_TYPE.MS_NEW_PEER_PRODUCER,
                                    payload: { producerId: producer.id, userId: memberId, appData: producer.appData }
                                }));
                            });
                        }
                    }
                });
            }
            return true;
        }
        
        else if (msgType === C2S_MSG_TYPE.MS_CONSUME) {
            const { transportId, producerId, rtpCapabilities, channelId } = parsedMessage.payload as any;
            const transport = peerData.transports.get(transportId);
            const router = await mediasoupManager.getOrCreateRouter(channelId);
            
            if (transport && router.canConsume({ producerId, rtpCapabilities })) {
                // Create consumer in PAUSED state first
                const consumer = await transport.consume({
                    producerId,
                    rtpCapabilities,
                    paused: true,
                });
                
                peerData.consumers.set(consumer.id, consumer);
                
                ws.send(JSON.stringify({
                    type: S2C_MSG_TYPE.MS_CONSUMER_CREATED,
                    payload: {
                        id: consumer.id,
                        producerId,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                    }
                }));
                
                // IMMEDIATELY RESUME on server side to start data flow
                await consumer.resume();
                console.log(`[SFU] Consumer ${consumer.id} created and auto-resumed for ${userId}`);
            }
            return true;
        }
        
        else if (msgType === C2S_MSG_TYPE.MS_RESUME_CONSUMER) {
            const { producerId } = parsedMessage.payload as any;
            // Search by producerId or resume ALL if no ID provided
            if (producerId) {
                const consumer = Array.from(peerData.consumers.values()).find(c => c.producerId === producerId);
                if (consumer) {
                    await consumer.resume();
                    console.log(`[SFU] Manual resume for consumer of producer ${producerId}`);
                }
            } else {
                for (const consumer of peerData.consumers.values()) {
                    await consumer.resume();
                }
                console.log(`[SFU] Resumed ALL consumers for user ${userId}`);
            }
            return true;
        }

        else if (msgType === C2S_MSG_TYPE.MS_PAUSE_CONSUMER) {
            const { producerId } = parsedMessage.payload as any;
            const consumer = Array.from(peerData.consumers.values()).find(c => c.producerId === producerId);
            if (consumer) {
                await consumer.pause();
                console.log(`[SFU] Consumer paused for producer ${producerId}`);
            }
            return true;
        }
        
        else if (msgType === C2S_MSG_TYPE.MS_CLOSE_PRODUCER) {
            const { producerId } = parsedMessage.payload as any;
            const producer = peerData.producers.get(producerId);
            if (producer) {
                const wasScreenShare = producer.appData && producer.appData.source === 'screen';
                
                producer.close();
                peerData.producers.delete(producerId);
                
                let channelId = null;
                for (const [cId, members] of voiceChannels.entries()) {
                    if (members.has(userId)) {
                        channelId = cId;
                        break;
                    }
                }
                
                if (channelId) {
                    const members = voiceChannels.get(channelId);
                    if (members) {
                        members.forEach(memberId => {
                            if (memberId !== userId) {
                                const memberWs = userConnections.get(memberId);
                                if (memberWs) {
                                    memberWs.send(JSON.stringify({
                                        type: S2C_MSG_TYPE.MS_PRODUCER_CLOSED,
                                        payload: { producerId }
                                    }));
                                }
                            }
                        });
                    }
                }

                // If screen share stopped, update voice state
                if (wasScreenShare) {
                    const voiceStateUpdateMsg: WebSocketMessage<any> = {
                        type: S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE,
                        payload: { userId, channelId, isScreenSharing: false }
                    };
                    clients.forEach((_, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify(voiceStateUpdateMsg));
                        }
                    });
                }
            }
            return true;
        }
    }

    // WebRTC Signaling (JOIN/LEAVE ONLY)
    if (!userId) return false; 

    // JOIN VOICE CHANNEL
    if (msgType === C2S_MSG_TYPE.C2S_WEBRTC_JOIN_VOICE_CHANNEL) {
        try {
            const payload = parsedMessage.payload as WebRtcJoinVoiceChannelPayload;
            const { channelId } = payload;
            
            // --- PERMISSION CHECK ---
            const channel = await prisma.channel.findUnique({ where: { id: channelId } });
            if (channel && channel.isPrivate) {
                const server = await prisma.server.findUnique({ select: { ownerId: true }, where: { id: channel.serverId } });
                if (server?.ownerId !== userId) {
                    const userRoles = await prisma.userRole.findMany({
                        where: { userId: userId, role: { serverId: channel.serverId } },
                        include: { role: true }
                    });
                    
                    const perms = userRoles.reduce((acc, ur) => acc | BigInt(ur.role.permissions || '0'), 0n);
                    const isAdmin = (perms & 1n) === 1n; // ADMINISTRATOR
                    const canManageChannels = (perms & 8n) === 8n; // MANAGE_CHANNELS
                    const canManageServer = (perms & 2n) === 2n; // MANAGE_SERVER

                    if (!isAdmin && !canManageChannels && !canManageServer) {
                        console.warn(`User ${userId} blocked from private voice channel ${channelId}`);
                        return true;
                    }
                }
            }
            // ------------------------

            console.log(`[Server] User ${userId} joining voice channel: ${channelId}`);
        
            if (!voiceChannels.has(channelId)) {
                voiceChannels.set(channelId, new Set());
            }
            const channelMembers = voiceChannels.get(channelId)!;
            channelMembers.add(userId); // ADD FIRST
            
            const username = currentUser ? currentUser.username : 'Unknown';
            const userAvatar = currentUser ? currentUser.avatar : undefined;

            const joinNotificationPayload: WebRtcUserJoinedVoiceChannelPayload = { 
                channelId, 
                userId, 
                username,
                userAvatar
            };
            const joinNotification: WebSocketMessage<WebRtcUserJoinedVoiceChannelPayload> = {
                type: S2C_MSG_TYPE.S2C_WEBRTC_USER_JOINED_VOICE_CHANNEL,
                payload: joinNotificationPayload,
            };
            
            channelMembers.forEach(memberId => {
                const memberWs = userConnections.get(memberId);
                if (memberWs && memberWs.readyState === WebSocket.OPEN) {
                    memberWs.send(JSON.stringify(joinNotification));
                }
            });
            
            // Redundant self-notification removed as it's now in the loop above

            const voiceStateUpdateMsg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE,
                payload: { userId, channelId, username, userAvatar }
            };
            clients.forEach((_, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(voiceStateUpdateMsg));
                }
            });

            const existingMembersList: { userId: string; username: string; userAvatar?: string | null }[] = [];
            for (const memberId of channelMembers) {
                if (memberId === userId) continue;
                
                try {
                    const memberUser = await prisma.user.findUnique({ select: { id: true, username: true, discriminator: true, avatar: true }, where: { id: memberId } });
                    if (memberUser) {
                        existingMembersList.push({
                            userId: memberUser.id,
                            username: memberUser.username,
                            userAvatar: memberUser.avatar
                        });
                    }
                } catch (e) {
                    console.error(`Failed to fetch info for member ${memberId}`, e);
                }
            }

            if (existingMembersList.length > 0) {
                const existingMembersMsg: WebSocketMessage<WebRtcExistingMembersPayload> = {
                    type: S2C_MSG_TYPE.S2C_WEBRTC_EXISTING_VOICE_MEMBERS,
                    payload: {
                        channelId,
                        members: existingMembersList
                    }
                };
                ws.send(JSON.stringify(existingMembersMsg));
            }
        
            console.log(`[Server] User ${userId} successfully added to channel map. Members:`, Array.from(channelMembers));
        } catch (err) {
            console.error(`[Server] Error in JOIN_VOICE_CHANNEL:`, err);
        }
        return true;
    }

    // LEAVE VOICE CHANNEL
    else if (msgType === C2S_MSG_TYPE.C2S_WEBRTC_LEAVE_VOICE_CHANNEL) {
        const payload = parsedMessage.payload as WebRtcLeaveVoiceChannelPayload;
        const { channelId } = payload;
        const channelMembers = voiceChannels.get(channelId);
        if (channelMembers && channelMembers.has(userId)) {
            channelMembers.delete(userId);
            console.log(`User ${userId} left voice channel ${channelId}`);

            const leaveNotificationPayload: WebRtcUserLeftVoiceChannelPayload = { channelId, userId };
            const leaveNotification: WebSocketMessage<WebRtcUserLeftVoiceChannelPayload> = {
                type: S2C_MSG_TYPE.S2C_WEBRTC_USER_LEFT_VOICE_CHANNEL,
                payload: leaveNotificationPayload,
            };

            channelMembers.forEach(memberId => {
                const memberWs = userConnections.get(memberId);
                if (memberWs && memberWs.readyState === WebSocket.OPEN) {
                    memberWs.send(JSON.stringify(leaveNotification));
                }
            });

            const voiceStateUpdateMsg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE,
                payload: { userId, channelId: null }
            };
            clients.forEach((_, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(voiceStateUpdateMsg));
                }
            });
        }
        return true;
    }

    return false;
}
