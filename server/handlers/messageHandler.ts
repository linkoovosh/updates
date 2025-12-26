import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../prisma.js'; // NEW
import { clients, userConnections, clientStates, temporaryDevelopers, serverMembersCache, serverErrors, serverStartTime } from '../state.js';
import { storageService } from '../services/StorageService.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    ChannelMessage, 
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
    DirectMessage, 
    NewMessagePayload, 
    TypingPayload,
    DmHistoryResponsePayload 
} from '../../murchat/common/types.js';

// Track last message timestamp per user per channel for slowmode
const lastMessageTimestamps: Map<string, number> = new Map();

export async function handleMessageMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    if (parsedMessage.type === C2S_MSG_TYPE.SEND_MESSAGE) {
        const payload = parsedMessage.payload as SendMessagePayload;
        
        // --- DEV COMMAND INTERCEPTOR ---
        if (payload.content.startsWith('/dev ')) {
            const args = payload.content.split(' ');
            const command = args[1]; // add | out | list | stats | errors
            const targetFullTag = args[2]; // e.g. User#1234

            const currentUserTag = `${currentUser.username}#${currentUser.discriminator}`;
            if (!['LINKO#5693', 'Enterprise#2597'].includes(currentUserTag)) {
                return true; // Ignore unauthorized attempts
            }

            if (command === 'list') {
                const manualDevs = Array.from(temporaryDevelopers).join(', ') || 'None';
                const listMsg = `🛠 **Developer Access List**\n**Admins:** LINKO#5693, Enterprise#2597\n**Temporary:** ${manualDevs}`;
                
                const sysMsg: WebSocketMessage<NewMessagePayload> = {
                    type: S2C_MSG_TYPE.NEW_MESSAGE,
                    payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: listMsg } }
                };
                ws.send(JSON.stringify(sysMsg));
                return true;
            }

            if (command === 'stats') {
                const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = uptime % 60;

                const mem = process.memoryUsage();
                const usedRAM = (mem.heapUsed / 1024 / 1024).toFixed(2);
                const totalRAM = (mem.heapTotal / 1024 / 1024).toFixed(2);
                const rssRAM = (mem.rss / 1024 / 1024).toFixed(2);

                const statsMsg = `📊 **Server Diagnostics**\n` +
                                 `⏱ **Uptime:** ${hours}h ${minutes}m ${seconds}s\n` +
                                 `👥 **Active Connections:** ${userConnections.size}\n` +
                                 `💾 **RAM (Used/Total):** ${usedRAM}MB / ${totalRAM}MB\n` +
                                 `📟 **RSS Memory:** ${rssRAM}MB\n` +
                                 `🗄 **Member Cache:** ${serverMembersCache.size} servers cached\n` +
                                 `⚙️ **Platform:** ${process.platform} (${process.arch})`;

                const sysMsg: WebSocketMessage<NewMessagePayload> = {
                    type: S2C_MSG_TYPE.NEW_MESSAGE,
                    payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: statsMsg } }
                };
                ws.send(JSON.stringify(sysMsg));
                return true;
            }

            if (command === 'errors') {
                let errorContent = `⚠️ **Recent Server Errors (Last 10)**\n`;
                if (serverErrors.length === 0) {
                    errorContent += "_No errors logged since last restart._";
                } else {
                    serverErrors.slice(0, 10).forEach((err, idx) => {
                        const time = new Date(err.timestamp).toLocaleTimeString();
                        errorContent += `\`[${time}]\` ${err.message}\n`;
                    });
                }

                const sysMsg: WebSocketMessage<NewMessagePayload> = {
                    type: S2C_MSG_TYPE.NEW_MESSAGE,
                    payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: errorContent } }
                };
                ws.send(JSON.stringify(sysMsg));
                return true;
            }

            if (targetFullTag && targetFullTag.includes('#')) {
                const [targetUsername, targetDiscriminator] = targetFullTag.split('#');
                const targetUser = await prisma.user.findFirst({
                    where: {
                        username: targetUsername, 
                        discriminator: targetDiscriminator 
                    } 
                });
                
                if (targetUser) {
                    const targetWs = userConnections.get(targetUser.id);
                    
                    if (command === 'add') {
                        temporaryDevelopers.add(targetFullTag); 
                        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                            const msg: WebSocketMessage<any> = {
                                type: S2C_MSG_TYPE.DEV_ACCESS_GRANTED,
                                payload: { grantedBy: currentUser.username }
                            };
                            targetWs.send(JSON.stringify(msg));
                        }
                        const confirmMsg: WebSocketMessage<NewMessagePayload> = {
                            type: S2C_MSG_TYPE.NEW_MESSAGE,
                            payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `✅ Developer access granted to **${targetFullTag}**` } }
                        };
                        ws.send(JSON.stringify(confirmMsg));

                    } else if (command === 'out') {
                        temporaryDevelopers.delete(targetFullTag);
                        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                            const msg: WebSocketMessage<any> = {
                                type: S2C_MSG_TYPE.DEV_ACCESS_REVOKED,
                                payload: { revokedBy: currentUser.username }
                            };
                            targetWs.send(JSON.stringify(msg));
                        }
                        const confirmMsg: WebSocketMessage<NewMessagePayload> = {
                            type: S2C_MSG_TYPE.NEW_MESSAGE,
                            payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `🚫 Developer access revoked from **${targetFullTag}**` } }
                        };
                        ws.send(JSON.stringify(confirmMsg));
                    }
                } else {
                     const errorMsg: WebSocketMessage<NewMessagePayload> = {
                        type: S2C_MSG_TYPE.NEW_MESSAGE,
                        payload: {
                            message: {
                                id: uuidv4(),
                                channelId: payload.channelId,
                                author: 'System',
                                authorId: 'system',
                                timestamp: Date.now(),
                                content: `❌ User **${targetFullTag}** not found.`
                            }
                        }
                    };
                    ws.send(JSON.stringify(errorMsg));
                }
            }
            return true; 
        }
        // -------------------------------

        const targetChannel = await prisma.channel.findUnique({ where: { id: payload.channelId } });

        if (!targetChannel) return true;

        if (targetChannel.slowMode > 0) {
            const slowModeKey = `${userId}:${payload.channelId}`;
            const lastTime = lastMessageTimestamps.get(slowModeKey) || 0;
            const now = Date.now();
            const diff = (now - lastTime) / 1000;

            if (diff < targetChannel.slowMode) {
                console.warn(`User ${userId} is on slowmode cooldown in channel ${payload.channelId} (${diff.toFixed(1)}/${targetChannel.slowMode}s)`);
                return true; 
            }
            lastMessageTimestamps.set(slowModeKey, now);
        }

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

        const responseMessage: WebSocketMessage<NewMessagePayload> = {
            type: S2C_MSG_TYPE.NEW_MESSAGE,
            payload: { message: newMessage },
        };
        
        try {
            let memberIds = serverMembersCache.get(targetChannel.serverId);
            if (!memberIds) {
                const serverMembers = await prisma.serverMember.findMany({
                    where: { serverId: targetChannel.serverId },
                    select: { userId: true }
                });
                memberIds = new Set(serverMembers.map(m => m.userId));
                serverMembersCache.set(targetChannel.serverId, memberIds);
            }

            userConnections.forEach((wsClient, memberId) => {
                if (memberIds?.has(memberId) && wsClient.readyState === WebSocket.OPEN) {
                    wsClient.send(JSON.stringify(responseMessage));
                }
            });
        } catch (e) {
            console.error("Failed to broadcast message:", e);
        }

        storageService.saveChannelMessage(targetChannel.serverId, newMessage)
            .then(() => console.log(`[Storage] Saved msg (Async)`))
            .catch(e => console.error("Failed to save msg:", e));

        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.GET_CHANNEL_MESSAGES) {
        const payload = parsedMessage.payload as GetChannelMessagesPayload;
        const limit = payload.limit || 50;
        const beforeTimestamp = payload.beforeTimestamp || Date.now();

        try {
            const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
            if (!channel) return true;

            if (channel.isPrivate) {
                const server = await prisma.server.findUnique({ select: { ownerId: true }, where: { id: channel.serverId } });
                if (server?.ownerId !== userId) {
                    const userRoles = await prisma.userRole.findMany({
                        where: { userId: userId, role: { serverId: channel.serverId } },
                        include: { role: true }
                    });
                    
                    const perms = userRoles.reduce((acc, ur) => acc | BigInt(ur.role.permissions || '0'), 0n);
                    const isAdmin = (perms & 1n) === 1n;
                    const canManageChannels = (perms & 8n) === 8n;
                    const canManageServer = (perms & 2n) === 2n;

                    if (!isAdmin && !canManageChannels && !canManageServer) {
                        return true;
                    }
                }
            }

            const chronologicalMessages = await storageService.getChannelMessages(channel.serverId, payload.channelId, limit, beforeTimestamp);

            const response: WebSocketMessage<ChannelMessagesPayload> = {
                type: S2C_MSG_TYPE.CHANNEL_MESSAGES,
                payload: { channelId: payload.channelId, messages: chronologicalMessages }
            };
            ws.send(JSON.stringify(response));
        } catch (e) {
            console.error("Error fetching history:", e);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.MARK_CHANNEL_READ) {
        const payload = parsedMessage.payload as MarkChannelReadPayload;
        try {
            await prisma.userReadState.upsert({
                where: { userId_channelId: { userId: userId, channelId: payload.channelId } },
                update: { lastReadTimestamp: BigInt(Date.now()) },
                create: { userId: userId, channelId: payload.channelId, lastReadTimestamp: BigInt(Date.now()) }
            });
        } catch (e) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.EDIT_MESSAGE) {
        const payload = parsedMessage.payload as EditMessagePayload;
        const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
        if (!channel) return true;

        try {
            await storageService.updateChannelMessage(channel.serverId, payload.messageId, payload.content);
        } catch (e) {}

        const updateMsg: WebSocketMessage<MessageUpdatedPayload> = {
            type: S2C_MSG_TYPE.MESSAGE_UPDATED,
            payload: { messageId: payload.messageId, channelId: payload.channelId, content: payload.content, isEdited: true }
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

    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_MESSAGE) {
        const payload = parsedMessage.payload as DeleteMessagePayload;
        const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
        if (!channel) return true;

        try {
            await storageService.deleteChannelMessage(channel.serverId, payload.messageId);
        } catch (e) {}

        const deleteMsg: WebSocketMessage<MessageDeletedPayload> = {
            type: S2C_MSG_TYPE.MESSAGE_DELETED,
            payload: { messageId: payload.messageId, channelId: payload.channelId }
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

    else if (parsedMessage.type === C2S_MSG_TYPE.PIN_MESSAGE || parsedMessage.type === C2S_MSG_TYPE.UNPIN_MESSAGE) {
        const payload = parsedMessage.payload as { channelId: string, messageId: string };
        const isPinning = parsedMessage.type === C2S_MSG_TYPE.PIN_MESSAGE;

        try {
            const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
            if (!channel) return true;

            const server = await prisma.server.findUnique({ select: { ownerId: true }, where: { id: channel.serverId } });
            if (server?.ownerId !== userId) {
                const userRoles = await prisma.userRole.findMany({
                    where: { userId: userId, role: { serverId: channel.serverId } },
                    include: { role: true }
                });
                const perms = userRoles.reduce((acc, ur) => acc | BigInt(ur.role.permissions || '0'), 0n);
                const canManage = (perms & 1n) === 1n || (perms & 16n) === 16n;
                if (!canManage) return true;
            }

            if (isPinning) await storageService.pinChannelMessage(channel.serverId, payload.messageId);
            else await storageService.unpinChannelMessage(channel.serverId, payload.messageId);

            const broadcastMsg: WebSocketMessage<any> = {
                type: isPinning ? S2C_MSG_TYPE.MESSAGE_PINNED : S2C_MSG_TYPE.MESSAGE_UNPINNED,
                payload: { messageId: payload.messageId, channelId: payload.channelId }
            };

            clients.forEach((uid, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                     const clientState = clientStates.get(uid);
                     if (clientState && clientState.selectedServerId === channel.serverId) {
                         clientWs.send(JSON.stringify(broadcastMsg));
                     }
                }
            });
        } catch (e) {}
        return true;
    }
    
    else if (parsedMessage.type === C2S_MSG_TYPE.SEND_DM) {
        const payload = parsedMessage.payload as SendDmPayload;
        const { recipientId, content, timestamp, messageId, attachments, audioData } = payload;
        
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
        } catch (err) {}

        const recipientWs = userConnections.get(recipientId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            const dmPayload: ReceiveDmPayload = {
                messageId: newDm.id,
                senderId: userId,
                content,
                timestamp,
                attachments,
                audioData
            };
            recipientWs.send(JSON.stringify({ type: S2C_MSG_TYPE.RECEIVE_DM, payload: dmPayload }));
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.GET_DM_HISTORY) {
        const payload = parsedMessage.payload as GetDmHistoryPayload;
        const { recipientId, limit = 50 } = payload;
        try {
            const messages = await storageService.getDmHistory(userId, recipientId, limit);
            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.DM_HISTORY, payload: { recipientId, messages } }));
        } catch (err) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.TYPING_START || parsedMessage.type === C2S_MSG_TYPE.TYPING_STOP) {
        const { channelId } = parsedMessage.payload as { channelId: string };
        const isTyping = parsedMessage.type === C2S_MSG_TYPE.TYPING_START;

        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (channel) {
            const typingMsg: WebSocketMessage<TypingPayload> = {
                type: S2C_MSG_TYPE.USER_TYPING,
                payload: { channelId, userId, username: currentUser ? currentUser.username : 'Unknown', isTyping }
            };
            clients.forEach((uid, clientWs) => {
                if (uid !== userId && uid !== undefined && clientWs.readyState === WebSocket.OPEN) {
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
                    payload: { channelId: userId, userId, username: currentUser ? currentUser.username : 'Unknown', isTyping }
                };
                recipientWs.send(JSON.stringify(typingMsg));
            }
        }
        return true;
    }

    return false;
}