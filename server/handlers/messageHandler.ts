import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import v8 from 'v8';
import { prisma } from '../prisma.js';
import { clients, userConnections, clientStates, temporaryDevelopers, serverMembersCache, serverErrors, serverStartTime } from '../state.js';
import { storageService } from '../services/StorageService.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    ChannelMessage,
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

const lastMessageTimestamps: Map<string, number> = new Map();

export async function handleMessageMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    if (parsedMessage.type === C2S_MSG_TYPE.SEND_MESSAGE) {
        const payload = parsedMessage.payload as SendMessagePayload;
        
        // --- DEV COMMAND INTERCEPTOR ---
        if (payload.content.startsWith('/dev ')) {
            const args = payload.content.split(' ');
            const command = args[1]; // add | out | list | stats | errors | reload | announcement | etc
            const targetFullTag = args[2]; 

            const currentUserTag = `${currentUser.username}#${currentUser.discriminator}`;
            if (!['LINKO#5693', 'Enterprise#2597'].includes(currentUserTag)) {
                return true; 
            }

            // --- GLOBAL COMMANDS ---
            if (command === 'reload') {
                clients.forEach((_, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: S2C_MSG_TYPE.RELOAD_APP, payload: {} }));
                    }
                });
                return true;
            }

            if (command === 'announcement') {
                const content = args.slice(2).join(' ');
                if (!content) return true;
                clients.forEach((_, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: S2C_MSG_TYPE.SHOW_ANNOUNCEMENT, payload: { content } }));
                    }
                });
                return true;
            }

            if (command === 'broadcast') {
                const broadcastContent = args.slice(2).join(' ');
                if (!broadcastContent) return true;
                const sysMsg: WebSocketMessage<NewMessagePayload> = {
                    type: S2C_MSG_TYPE.NEW_MESSAGE,
                    payload: { message: { id: uuidv4(), channelId: payload.channelId, author: '📢 SYSTEM ANNOUNCEMENT', authorId: 'system', timestamp: Date.now(), content: `⚡️ **ОБЪЯВЛЕНИЕ:** ${broadcastContent}` } }
                };
                clients.forEach((_, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(sysMsg));
                });
                return true;
            }

            if (command === 'servers') {
                const allServers = await prisma.server.findMany({ select: { name: true, id: true, ownerId: true } });
                let serverList = `🏰 **Global Servers List (${allServers.length})**\n`;
                allServers.slice(0, 20).forEach(s => {
                    serverList += `• **${s.name}** (\\\`${s.id}\\\`) - Owner: \\\`${s.ownerId}\\\`\n`;
                });
                ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: serverList } } }));
                return true;
            }

            if (command === 'gc') {
                if (global.gc) {
                    const before = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                    global.gc();
                    const after = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                    ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `♻️ **Garbage Collection Done.** RAM: ${before}MB -> ${after}MB` } } }));
                }
                return true;
            }

            if (command === 'clearcache') {
                serverMembersCache.clear();
                ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `🗄 **Cache cleared.**` } } }));
                return true;
            }

            if (command === 'list') {
                const manualDevs = Array.from(temporaryDevelopers).join(', ') || 'None';
                const listMsg = `🛠 **Developer Access List**\n**Admins:** LINKO#5693, Enterprise#2597\n**Temporary:** ${manualDevs}`;
                ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: listMsg } } }));
                return true;
            }

            if (command === 'stats') {
                const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = uptime % 60;
                const mem = process.memoryUsage();
                const heapStats = v8.getHeapStatistics();
                const usedRAM = (mem.heapUsed / 1024 / 1024).toFixed(2);
                const allocatedRAM = (mem.heapTotal / 1024 / 1024).toFixed(2);
                const limitRAM = (heapStats.heap_size_limit / 1024 / 1024 / 1024).toFixed(2);
                const statsMsg = `📊 **Server Diagnostics**\n⏱ **Uptime:** ${hours}h ${minutes}m ${seconds}s\n👥 **Connections:** ${userConnections.size}\n💾 **RAM (Used/Alloc):** ${usedRAM}MB / ${allocatedRAM}MB\n🚀 **Limit:** ${limitRAM} GB\n🗄 **Cache:** ${serverMembersCache.size} servers`;
                ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: statsMsg } } }));
                return true;
            }

            if (command === 'errors') {
                let errorContent = `⚠️ **Recent Server Errors (Last 10)**\n`;
                if (serverErrors.length === 0) errorContent += "_No errors.";
                else serverErrors.slice(0, 10).forEach(err => { errorContent += `\\[${new Date(err.timestamp).toLocaleTimeString()}\\] ${err.message}\n`; });
                ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: errorContent } } }));
                return true;
            }

            if (command === 'slowmode') {
                const seconds = parseInt(args[2]);
                if (!isNaN(seconds)) {
                    await prisma.channel.update({ where: { id: payload.channelId }, data: { slowMode: seconds } });
                    ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `⏲ **Slowmode set to ${seconds}s**` } } }));
                }
                return true;
            }

            if (command === 'wipe') {
                const amount = parseInt(args[2]);
                if (!isNaN(amount)) {
                    const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
                    if (channel) {
                        await storageService.wipeChannelMessages(channel.serverId, payload.channelId, amount);
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `🧹 **Wiped last ${amount} messages.**` } } }));
                    }
                }
                return true;
            }

            // --- TAG-BASED COMMANDS ---
            if (targetFullTag && targetFullTag.includes('#')) {
                const [targetUsername, targetDiscriminator] = targetFullTag.split('#');
                const targetUser = await prisma.user.findFirst({ where: { username: targetUsername, discriminator: targetDiscriminator } });
                if (targetUser) {
                    const targetWs = userConnections.get(targetUser.id);
                    if (command === 'add') {
                        temporaryDevelopers.add(targetFullTag);
                        if (targetWs) targetWs.send(JSON.stringify({ type: S2C_MSG_TYPE.DEV_ACCESS_GRANTED, payload: { grantedBy: currentUser.username } }));
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `✅ Added **${targetFullTag}** to Devs.` } } }));
                    } else if (command === 'out') {
                        temporaryDevelopers.delete(targetFullTag);
                        if (targetWs) targetWs.send(JSON.stringify({ type: S2C_MSG_TYPE.DEV_ACCESS_REVOKED, payload: { revokedBy: currentUser.username } }));
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `🚫 Removed **${targetFullTag}** from Devs.` } } }));
                    } else if (command === 'dump') {
                        if (targetWs) targetWs.send(JSON.stringify({ type: S2C_MSG_TYPE.REQUEST_LOG_DUMP, payload: {} }));
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `📡 **Dump requested** for **${targetFullTag}**.` } } }));
                    } else if (command === 'kick') {
                        if (targetWs) targetWs.close(1000, "Kicked by Admin");
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `👢 **Kicked** **${targetFullTag}**.` } } }));
                    } else if (command === 'verify') {
                        await prisma.user.update({ where: { id: targetUser.id }, data: { isVerified: true } });
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `🛡 **${targetFullTag}** VERIFIED.` } } }));
                    } else if (command === 'rename') {
                        const newNick = args.slice(3).join(' ');
                        if (newNick) {
                            await prisma.user.update({ where: { id: targetUser.id }, data: { username: newNick } });
                            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `✍️ Renamed to **${newNick}**.` } } }));
                        }
                    } else if (command === 'catmode') {
                        const sub = args[3];
                        if (targetWs && (sub === 'on' || sub === 'off')) {
                            targetWs.send(JSON.stringify({ type: S2C_MSG_TYPE.FORCE_CAT_MODE, payload: { enabled: sub === 'on' } }));
                            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `🐾 **Cat Mode ${sub.toUpperCase()}** for **${targetFullTag}**.` } } }));
                        }
                    } else if (command === 'info') {
                        const srvCount = await prisma.serverMember.count({ where: { userId: targetUser.id } });
                        const infoMsg = `👤 **Dossier: ${targetFullTag}**\n🆔 ID: \\[${targetUser.id}\\]\n📧 Email: ${targetUser.email}\n🏰 Servers: ${srvCount}\n🛡 Verified: ${targetUser.isVerified ? '✅' : '❌'}`;
                        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: infoMsg } } }));
                    } else if (command === 'dm') {
                        const dmText = args.slice(3).join(' ');
                        if (targetWs && dmText) {
                            targetWs.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: 'system', author: '🔐 SYSTEM MESSAGE', authorId: 'system', timestamp: Date.now(), content: `⚠️ **ВНИМАНИЕ:** ${dmText}` } } }));
                            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: { id: uuidv4(), channelId: payload.channelId, author: 'System', authorId: 'system', timestamp: Date.now(), content: `📤 **DM sent** to **${targetFullTag}**.` } } }));
                        }
                    }
                }
            }
            return true;
        }

        const targetChannel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
        if (!targetChannel) return true;

        if (targetChannel.slowMode > 0) {
            const lastTime = lastMessageTimestamps.get(`${userId}:${payload.channelId}`) || 0;
            const diff = (Date.now() - lastTime) / 1000;
            if (diff < targetChannel.slowMode) return true;
            lastMessageTimestamps.set(`${userId}:${payload.channelId}`, Date.now());
        }

        const newMessage: ChannelMessage = { id: uuidv4(), channelId: payload.channelId, author: currentUser ? currentUser.username : 'Unknown', authorId: userId, authorAvatar: currentUser ? currentUser.avatar : undefined, timestamp: Date.now(), content: payload.content, audioData: payload.audioData, attachments: payload.attachments, replyToId: payload.replyToId };
        const responseMessage: WebSocketMessage<NewMessagePayload> = { type: S2C_MSG_TYPE.NEW_MESSAGE, payload: { message: newMessage } };
        
        try {
            let memberIds = serverMembersCache.get(targetChannel.serverId);
            if (!memberIds) {
                const serverMembers = await prisma.serverMember.findMany({ where: { serverId: targetChannel.serverId }, select: { userId: true } });
                memberIds = new Set(serverMembers.map(m => m.userId));
                serverMembersCache.set(targetChannel.serverId, memberIds);
            }
            userConnections.forEach((wsClient, memberId) => {
                if (memberIds?.has(memberId) && wsClient.readyState === WebSocket.OPEN) wsClient.send(JSON.stringify(responseMessage));
            });
        } catch (e) {}

        storageService.saveChannelMessage(targetChannel.serverId, newMessage).catch(() => {});
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.GET_CHANNEL_MESSAGES) {
        const payload = parsedMessage.payload as GetChannelMessagesPayload;
        try {
            const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
            if (channel) {
                const msgs = await storageService.getChannelMessages(channel.serverId, payload.channelId, payload.limit || 50, payload.beforeTimestamp || Date.now());
                ws.send(JSON.stringify({ type: S2C_MSG_TYPE.CHANNEL_MESSAGES, payload: { channelId: payload.channelId, messages: msgs } }));
            }
        } catch (e) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.MARK_CHANNEL_READ) {
        const payload = parsedMessage.payload as MarkChannelReadPayload;
        try {
            await prisma.userReadState.upsert({ where: { userId_channelId: { userId, channelId: payload.channelId } }, update: { lastReadTimestamp: BigInt(Date.now()) }, create: { userId, channelId: payload.channelId, lastReadTimestamp: BigInt(Date.now()) } });
        } catch (e) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.EDIT_MESSAGE) {
        const payload = parsedMessage.payload as EditMessagePayload;
        try {
            const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
            if (channel) {
                await storageService.updateChannelMessage(channel.serverId, payload.messageId, payload.content);
                const updateMsg = { type: S2C_MSG_TYPE.MESSAGE_UPDATED, payload: { messageId: payload.messageId, channelId: payload.channelId, content: payload.content, isEdited: true } };
                clients.forEach((uid, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN && clientStates.get(uid)?.selectedServerId === channel.serverId) clientWs.send(JSON.stringify(updateMsg));
                });
            }
        } catch (e) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_MESSAGE) {
        const payload = parsedMessage.payload as DeleteMessagePayload;
        try {
            const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
            if (channel) {
                await storageService.deleteChannelMessage(channel.serverId, payload.messageId);
                const deleteMsg = { type: S2C_MSG_TYPE.MESSAGE_DELETED, payload: { messageId: payload.messageId, channelId: payload.channelId } };
                clients.forEach((uid, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN && clientStates.get(uid)?.selectedServerId === channel.serverId) clientWs.send(JSON.stringify(deleteMsg));
                });
            }
        } catch (e) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.PIN_MESSAGE || parsedMessage.type === C2S_MSG_TYPE.UNPIN_MESSAGE) {
        const payload = parsedMessage.payload as { channelId: string, messageId: string };
        const isPinning = parsedMessage.type === C2S_MSG_TYPE.PIN_MESSAGE;
        try {
            const channel = await prisma.channel.findUnique({ select: { serverId: true }, where: { id: payload.channelId } });
            if (channel) {
                if (isPinning) await storageService.pinChannelMessage(channel.serverId, payload.messageId);
                else await storageService.unpinChannelMessage(channel.serverId, payload.messageId);
                const broadcastMsg = { type: isPinning ? S2C_MSG_TYPE.MESSAGE_PINNED : S2C_MSG_TYPE.MESSAGE_UNPINNED, payload: { messageId: payload.messageId, channelId: payload.channelId } };
                clients.forEach((uid, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN && clientStates.get(uid)?.selectedServerId === channel.serverId) clientWs.send(JSON.stringify(broadcastMsg));
                });
            }
        } catch (e) {}
        return true;
    }
    
    else if (parsedMessage.type === C2S_MSG_TYPE.SEND_DM) {
        const payload = parsedMessage.payload as SendDmPayload;
        const newDm: DirectMessage = { id: payload.messageId || uuidv4(), senderId: userId, recipientId: payload.recipientId, content: payload.content, timestamp: payload.timestamp, read: 0, attachments: payload.attachments, audioData: payload.audioData };
        try { await storageService.saveDirectMessage(newDm); } catch (err) {}
        const recipientWs = userConnections.get(payload.recipientId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            const dmPayload: ReceiveDmPayload = { messageId: newDm.id, senderId: userId, content: payload.content, timestamp: payload.timestamp, attachments: payload.attachments, audioData: payload.audioData };
            recipientWs.send(JSON.stringify({ type: S2C_MSG_TYPE.RECEIVE_DM, payload: dmPayload }));
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.GET_DM_HISTORY) {
        const payload = parsedMessage.payload as GetDmHistoryPayload;
        try {
            const messages = await storageService.getDmHistory(userId, payload.recipientId, payload.limit || 50);
            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.DM_HISTORY, payload: { recipientId: payload.recipientId, messages } }));
        } catch (err) {}
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.TYPING_START || parsedMessage.type === C2S_MSG_TYPE.TYPING_STOP) {
        const { channelId } = parsedMessage.payload as { channelId: string };
        const isTyping = parsedMessage.type === C2S_MSG_TYPE.TYPING_START;
        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (channel) {
            const typingMsg = { type: S2C_MSG_TYPE.USER_TYPING, payload: { channelId, userId, username: currentUser ? currentUser.username : 'Unknown', isTyping } };
            clients.forEach((uid, clientWs) => {
                if (uid !== userId && clientWs.readyState === WebSocket.OPEN && clientStates.get(uid)?.selectedServerId === channel.serverId) clientWs.send(JSON.stringify(typingMsg));
            });
        } else {
            const recipientWs = userConnections.get(channelId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) recipientWs.send(JSON.stringify({ type: S2C_MSG_TYPE.USER_TYPING, payload: { channelId: userId, userId, username: currentUser ? currentUser.username : 'Unknown', isTyping } }));
        }
        return true;
    }

    return false;
}
