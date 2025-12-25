import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../prisma.js'; // NEW
import { clients, userConnections, clientStates } from '../state.js';
import { storageService } from '../services/StorageService.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    ChannelMessage, // Изменено с Message
    Channel,
    SendMessagePayload,
    GetChannelMessagesPayload,
    ChannelMessagesPayload,
    MarkChannelReadPayload,
    EditMessagePayload,
    MessageUpdatedPayload,
    DeleteMessagePayload,
    MessageDeletedPayload,
    SendDmPayload,
    ReceiveDmPayload,
    GetDmHistoryPayload,
    DirectMessage, // Изменено с DmMessage
    NewMessagePayload, // NEW
    TypingPayload,
    DmHistoryResponsePayload // NEW
} from '../../murchat/common/types.js';

// Track last message timestamp per user per channel for slowmode
const lastMessageTimestamps: Map<string, number> = new Map();

export async function handleMessageMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    if (parsedMessage.type === C2S_MSG_TYPE.SEND_MESSAGE) {
        const payload = parsedMessage.payload as SendMessagePayload;
        const targetChannel = await prisma.channel.findUnique({ where: { id: payload.channelId } });

        if (!targetChannel) return true;

        // --- SLOW MODE CHECK ---
        if (targetChannel.slowMode > 0) {
            const slowModeKey = `${userId}:${payload.channelId}`;
            const lastTime = lastMessageTimestamps.get(slowModeKey) || 0;
            const now = Date.now();
            const diff = (now - lastTime) / 1000;

            if (diff < targetChannel.slowMode) {
                console.warn(`User ${userId} is on slowmode cooldown in channel ${payload.channelId} (${diff.toFixed(1)}/${targetChannel.slowMode}s)`);
                return true; // Silent reject or we could send an error back
            }
            lastMessageTimestamps.set(slowModeKey, now);
        }
        // ------------------------

        const newMessage: ChannelMessage = { 
            id: uuidv4(),
            channelId: payload.channelId,
            author: currentUser ? currentUser.username : 'Unknown',
            authorId: userId,
            authorAvatar: currentUser ? currentUser.avatar : undefined,
            timestamp: Date.now(),
            content: payload.content,
            audioData: payload.audioData,
            attachments: payload.attachments,
            replyToId: payload.replyToId
        };

        // PERSIST TO SHARDED STORAGE
        try {
            await storageService.saveChannelMessage(targetChannel.serverId, newMessage);
            console.log(`[Storage] Saved msg to server_${targetChannel.serverId}.sqlite`);
        } catch (e) {
            console.error("Failed to save channel message to shard:", e);
        }

        const responseMessage: WebSocketMessage<NewMessagePayload> = {
            type: S2C_MSG_TYPE.NEW_MESSAGE,
            payload: { message: newMessage },
        };
        
        // Broadcast to ALL members of this server who are currently online
        try {
            const serverMembers = await prisma.serverMember.findMany({
                where: { serverId: targetChannel.serverId },
                select: { userId: true }
            });
            const memberIds = new Set(serverMembers.map(m => m.userId));

            userConnections.forEach((wsClient, memberId) => {
                if (memberIds.has(memberId) && wsClient.readyState === WebSocket.OPEN) {
                    wsClient.send(JSON.stringify(responseMessage));
                }
            });
        } catch (e) {
            console.error("Failed to broadcast message to server members:", e);
        }
        return true;
    }

    // --- Channel History ---
    else if (parsedMessage.type === C2S_MSG_TYPE.GET_CHANNEL_MESSAGES) {
        const payload = parsedMessage.payload as GetChannelMessagesPayload;
        const limit = payload.limit || 50;
        const beforeTimestamp = payload.beforeTimestamp || Date.now();

        try {
            const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
            if (!channel) return true;

            // --- PERMISSION CHECK ---
            if (channel.isPrivate) {
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
                        console.warn(`User ${userId} attempted to access private channel ${payload.channelId} without permission.`);
                        return true;
                    }
                }
            }
            // ------------------------

            // Fetch from SHARDED STORAGE
            const chronologicalMessages = await storageService.getChannelMessages(channel.serverId, payload.channelId, limit, beforeTimestamp);

            const response: WebSocketMessage<ChannelMessagesPayload> = {
                type: S2C_MSG_TYPE.CHANNEL_MESSAGES,
                payload: {
                    channelId: payload.channelId,
                    messages: chronologicalMessages
                }
            };
            ws.send(JSON.stringify(response));
            console.log(`[Storage] Sent history from shard for channel ${payload.channelId} (${chronologicalMessages.length} msgs)`);
        } catch (e) {
            console.error("Error fetching channel history from shard:", e);
        }
        return true;
    }

    // --- Mark Read ---
    else if (parsedMessage.type === C2S_MSG_TYPE.MARK_CHANNEL_READ) {
        const payload = parsedMessage.payload as MarkChannelReadPayload;
        try {
            await prisma.userReadState.upsert({
                where: {
                    userId_channelId: { userId: userId, channelId: payload.channelId }
                },
                update: {
                    lastReadTimestamp: BigInt(Date.now())
                },
                create: {
                    userId: userId,
                    channelId: payload.channelId,
                    lastReadTimestamp: BigInt(Date.now())
                }
            });
        } catch (e) {
            console.error("Error marking channel as read:", e);
        }
        return true;
    }

    // --- Message Editing ---
    else if (parsedMessage.type === C2S_MSG_TYPE.EDIT_MESSAGE) {
        const payload = parsedMessage.payload as EditMessagePayload;
        
        const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
        if (!channel) return true;

        try {
            await storageService.updateChannelMessage(channel.serverId, payload.messageId, payload.content);
            console.log(`[Message] Updated persistent message in shard: ${payload.messageId}`);
        } catch (e) {
            console.error(`[Message] Failed to update persistent message in shard ${payload.messageId}:`, e);
        }

        const updateMsg: WebSocketMessage<MessageUpdatedPayload> = {
            type: S2C_MSG_TYPE.MESSAGE_UPDATED,
            payload: {
                messageId: payload.messageId,
                channelId: payload.channelId,
                content: payload.content,
                isEdited: true
            }
        };

        clients.forEach((uid, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                 const clientState = clientStates.get(uid);
                 if (clientState && clientState.selectedServerId === channel.serverId) {
                     clientWs.send(JSON.stringify(updateMsg));
                 }
            }
        });
        return true;
    }

    // --- Message Deletion ---
    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_MESSAGE) {
        const payload = parsedMessage.payload as DeleteMessagePayload;
        
        const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
        if (!channel) return true;

        try {
            await storageService.deleteChannelMessage(channel.serverId, payload.messageId);
            console.log(`[Message] Deleted persistent message in shard: ${payload.messageId}`);
        } catch (e) {
            console.error(`[Message] Failed to delete persistent message in shard ${payload.messageId}:`, e);
        }

        const deleteMsg: WebSocketMessage<MessageDeletedPayload> = {
            type: S2C_MSG_TYPE.MESSAGE_DELETED,
            payload: {
                messageId: payload.messageId,
                channelId: payload.channelId
            }
        };

        clients.forEach((uid, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                 const clientState = clientStates.get(uid);
                 if (clientState && clientState.selectedServerId === channel.serverId) {
                     clientWs.send(JSON.stringify(deleteMsg));
                 }
            }
        });
        return true;
    }

    // --- Message Pinning ---
    else if (parsedMessage.type === C2S_MSG_TYPE.PIN_MESSAGE || parsedMessage.type === C2S_MSG_TYPE.UNPIN_MESSAGE) {
        const payload = parsedMessage.payload as { channelId: string, messageId: string };
        const isPinning = parsedMessage.type === C2S_MSG_TYPE.PIN_MESSAGE;

        try {
            const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
            if (!channel) return true;

            // --- PERMISSION CHECK ---
            const server = await prisma.server.findUnique({ select: { ownerId: true }, where: { id: channel.serverId } });
            if (server?.ownerId !== userId) {
                const userRoles = await prisma.userRole.findMany({
                    where: { userId: userId, role: { serverId: channel.serverId } },
                    include: { role: true }
                });
                const perms = userRoles.reduce((acc, ur) => acc | BigInt(ur.role.permissions || '0'), 0n);
                const canManage = (perms & 1n) === 1n || (perms & 16n) === 16n; // ADMINISTRATOR or MANAGE_MESSAGES
                
                if (!canManage) {
                    console.warn(`User ${userId} attempted to pin/unpin without permission.`);
                    return true;
                }
            }

            if (isPinning) {
                await storageService.pinChannelMessage(channel.serverId, payload.messageId);
            } else {
                await storageService.unpinChannelMessage(channel.serverId, payload.messageId);
            }

            const broadcastMsg: WebSocketMessage<any> = {
                type: isPinning ? S2C_MSG_TYPE.MESSAGE_PINNED : S2C_MSG_TYPE.MESSAGE_UNPINNED,
                payload: {
                    messageId: payload.messageId,
                    channelId: payload.channelId
                }
            };

            clients.forEach((uid, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                     const clientState = clientStates.get(uid);
                     if (clientState && clientState.selectedServerId === channel.serverId) {
                         clientWs.send(JSON.stringify(broadcastMsg));
                     }
                }
            });

        } catch (e) {
            console.error("Error pinning/unpinning message:", e);
        }
        return true;
    }
    
    // --- DM Handling ---
    else if (parsedMessage.type === C2S_MSG_TYPE.SEND_DM) {
        const payload = parsedMessage.payload as SendDmPayload;
        const { recipientId, content, timestamp, messageId, attachments, audioData } = payload;
        
        console.log(`[DM] Received from ${userId} for ${recipientId}. Message: "${content}" (hasAudio: ${!!audioData})`);

        const newDm: DirectMessage = {
            id: messageId || uuidv4(),
            senderId: userId,
            recipientId: recipientId,
            content: content,
            timestamp: timestamp,
            read: 0,
            attachments: attachments,
            audioData: audioData
        };

        try {
            await storageService.saveDirectMessage(newDm);
            console.log(`[DM] Saved to sharded DB: ${newDm.id}`);
        } catch (err) {
            console.error('[DM] Error saving to sharded DB:', err);
        }

        const recipientWs = userConnections.get(recipientId);

        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            console.log(`[DM] Recipient ${recipientId} is online. Relaying...`);
            const dmPayload: ReceiveDmPayload = {
                messageId: newDm.id,
                senderId: userId,
                content,
                timestamp,
                attachments,
                audioData
            };
            const message: WebSocketMessage<ReceiveDmPayload> = {
                type: S2C_MSG_TYPE.RECEIVE_DM,
                payload: dmPayload,
            };
            recipientWs.send(JSON.stringify(message));
            console.log(`[DM] Relayed DM from ${userId} to ${recipientId}`);
        }
        return true;
    }

    // --- DM History ---
    else if (parsedMessage.type === C2S_MSG_TYPE.GET_DM_HISTORY) {
        const payload = parsedMessage.payload as GetDmHistoryPayload;
        const { recipientId, limit = 50 } = payload;
        
        try {
            const messages = await storageService.getDmHistory(userId, recipientId, limit);

            const response: WebSocketMessage<DmHistoryResponsePayload> = {
                type: S2C_MSG_TYPE.DM_HISTORY,
                payload: { recipientId, messages }
            };
            
            ws.send(JSON.stringify(response));
            console.log(`[DM] Sent history from shard with ${recipientId} to ${userId} (${messages.length} msgs)`);
        } catch (err) {
            console.error('[DM] Error fetching DM history from shard:', err);
        }
        return true;
    }

    // --- Typing Indicators ---
    else if (parsedMessage.type === C2S_MSG_TYPE.TYPING_START || parsedMessage.type === C2S_MSG_TYPE.TYPING_STOP) {
        const { channelId } = parsedMessage.payload as { channelId: string };
        const isTyping = parsedMessage.type === C2S_MSG_TYPE.TYPING_START;

        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (channel) {
            const typingMsg: WebSocketMessage<TypingPayload> = {
                type: S2C_MSG_TYPE.USER_TYPING,
                payload: {
                    channelId,
                    userId,
                    username: currentUser ? currentUser.username : 'Unknown',
                    isTyping
                }
            };
            clients.forEach((uid, clientWs) => {
                if (uid !== userId && uid !== undefined && clientWs.readyState === WebSocket.OPEN) { // Don't send to self
                     const clientState = clientStates.get(uid);
                     if (clientState && clientState.selectedServerId === channel.serverId) {
                         clientWs.send(JSON.stringify(typingMsg));
                     }
                }
            });
        } else {
            const recipientWs = userConnections.get(channelId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                 const typingMsg: WebSocketMessage<TypingPayload> = {
                    type: S2C_MSG_TYPE.USER_TYPING,
                    payload: {
                        channelId: userId,
                        userId,
                        username: currentUser ? currentUser.username : 'Unknown',
                        isTyping
                    }
                };
                recipientWs.send(JSON.stringify(typingMsg));
            }
        }
        return true;
    }

    return false;
}
