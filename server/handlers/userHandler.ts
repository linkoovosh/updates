import { WebSocket } from 'ws';
import { prisma } from '../prisma.js'; // NEW
import { clients, clientStates } from '../state.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    UpdateProfilePayload,
    UserUpdatedPayload,
    UpdateStatusPayload,
    PresenceUpdatePayload,
    UpdateActivityPayload, // NEW
    ActivityUpdatePayload, // NEW
    User
} from '../../murchat/common/types.js';

export async function handleUserMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    // const db = getDb();

    // --- Update Activity (Rich Presence) ---
    if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_ACTIVITY) {
        const payload = parsedMessage.payload as UpdateActivityPayload;
        
        // Update state in memory
        const state = clientStates.get(userId);
        if (state) {
            state.activity = payload.activity;
        } else {
            clientStates.set(userId, { selectedServerId: null, activity: payload.activity });
        }

        const activityUpdate: WebSocketMessage<ActivityUpdatePayload> = {
            type: S2C_MSG_TYPE.ACTIVITY_UPDATE,
            payload: { userId, activity: payload.activity }
        };
        
        // Broadcast to everyone
        clients.forEach((uid, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(activityUpdate));
            }
        });
        return true;
    }

    // --- Update Profile ---
    if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_PROFILE) {
        const payload = parsedMessage.payload as UpdateProfilePayload;
        let somethingChanged = false;

        if (payload.avatar) {
            await prisma.user.update({ where: { id: userId }, data: { avatar: payload.avatar } });
            somethingChanged = true;
        }
        if (payload.username) {
            const existingUser = await prisma.user.findFirst({ where: { username: payload.username, discriminator: currentUser.discriminator } });
            if (existingUser && existingUser.id !== userId) {
                console.error(`Username ${payload.username}#${currentUser.discriminator} is already taken.`);
            } else {
                await prisma.user.update({ where: { id: userId }, data: { username: payload.username } });
                somethingChanged = true;
            }
        }
        if (payload.bio) {
            await prisma.user.update({ where: { id: userId }, data: { bio: payload.bio } });
            somethingChanged = true;
        }
        if (payload.profile_banner) {
            await prisma.user.update({ where: { id: userId }, data: { profile_banner: payload.profile_banner } });
            somethingChanged = true;
        }
        if (payload.profile_theme) {
            await prisma.user.update({ where: { id: userId }, data: { profile_theme: payload.profile_theme } });
            somethingChanged = true;
        }
        
        if (somethingChanged) {
            currentUser = await prisma.user.findUnique({ where: { id: userId } });

            const userUpdatedPayload: UserUpdatedPayload = {
                userId: currentUser.id,
                user: {
                    id: currentUser.id,
                    username: currentUser.username,
                    discriminator: currentUser.discriminator,
                    email: currentUser.email,
                    avatar: currentUser.avatar,
                    bio: currentUser.bio,
                    profile_banner: currentUser.profile_banner,
                    profile_theme: currentUser.profile_theme,
                    status: currentUser.status,
                }
            };

            const userUpdatedMessage: WebSocketMessage<UserUpdatedPayload> = {
                type: S2C_MSG_TYPE.USER_UPDATED,
                payload: userUpdatedPayload,
            };

            ws.send(JSON.stringify(userUpdatedMessage));
            
            clients.forEach((uid, clientWs) => {
                if (uid !== userId && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(userUpdatedMessage));
                }
            });
        }
        return true;
    }
    
    // --- Update Status ---
    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_STATUS) {
        const payload = parsedMessage.payload as UpdateStatusPayload;
        await prisma.user.update({ where: { id: userId }, data: { status: payload.status } });

        const presenceUpdate: WebSocketMessage<PresenceUpdatePayload> = {
            type: S2C_MSG_TYPE.PRESENCE_UPDATE,
            payload: { userId, status: payload.status }
        };
        
        clients.forEach((uid, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(presenceUpdate));
            }
        });
        return true;
    }

    return false;
}
