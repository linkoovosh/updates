import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
// import { getDb, PUBLIC_SERVER_ID } from '../db.js'; // REMOVED
import { prisma } from '../prisma.js'; // UPDATED
import { clients, userConnections, serverMembersCache } from '../state.js';
import { sendVerificationCode } from '../services/emailService.js';
import { getUserServers, getVoiceStates, calculateUnreadCounts, enrichUser } from '../utils/dataUtils.js';

import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    RegisterPayload,
    LoginPayload,
    LoginWithTokenPayload,
    AuthSuccessPayload,
    AuthErrorPayload,
    VerificationRequiredPayload,
    VerifyEmailPayload,
    ResendVerificationCodePayload,
    ChangePasswordPayload,
    InitialStatePayload,
    Channel
} from '../../murchat/common/types.js';

function generateDiscriminator(): string {
    let disc: string;
    do {
        disc = Math.floor(1000 + Math.random() * 9000).toString(); // Ensure 4 digits, not '0000'
    } while (disc === '0000');
    return disc;
}

export async function handleAuthMessage(ws: WebSocket, message: WebSocketMessage<unknown>): Promise<boolean> {
    // const db = getDb(); // Using Prisma Client now

    // --- Authentication: REGISTER ---
    if (message.type === C2S_MSG_TYPE.REGISTER) {
        const payload = message.payload as RegisterPayload;
        
        const existingUser = await prisma.user.findUnique({ where: { email: payload.email } });
        if (existingUser) {
            if (!existingUser.isVerified) {
                // User exists but not verified. Resend code.
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                await prisma.user.update({ where: { email: payload.email }, data: { verificationCode: code } });
                await sendVerificationCode(payload.email, code, existingUser.username);
                
                const msg: WebSocketMessage<VerificationRequiredPayload> = {
                    type: S2C_MSG_TYPE.VERIFICATION_REQUIRED,
                    payload: { email: payload.email, message: 'Аккаунт уже создан, но не подтвержден. Код отправлен повторно.' }
                };
                ws.send(JSON.stringify(msg));
                return true;
            }

            const errorMsg: WebSocketMessage<AuthErrorPayload> = {
                type: S2C_MSG_TYPE.AUTH_ERROR,
                payload: { error: 'User with this email already exists' }
            };
            ws.send(JSON.stringify(errorMsg));
            return true;
        }

        const token = uuidv4();
        const newUserId = uuidv4();
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(payload.password, saltRounds);
        
        let discriminator = generateDiscriminator();
        let attempts = 0;
        while (attempts < 5) {
            const existingTag = await prisma.user.findFirst({ where: { username: payload.username, discriminator: discriminator } });
            if (!existingTag) break;
            discriminator = generateDiscriminator(); 
            attempts++;
        }
        if (attempts === 5) {
            const errorMsg: WebSocketMessage<AuthErrorPayload> = {
                type: S2C_MSG_TYPE.AUTH_ERROR,
                payload: { error: 'Could not generate unique discriminator. Please try a different username.' }
            };
            ws.send(JSON.stringify(errorMsg));
            return true;
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        await prisma.user.create({
            data: {
                id: newUserId,
                username: payload.username,
                discriminator: discriminator,
                email: payload.email,
                password: hashedPassword,
                token: token,
                avatar: '',
                status: 'online',
                isVerified: false, // INTEGER DEFAULT 0
                verificationCode: verificationCode,
                isPublic: true, // Assuming this is the default from the migration
            }
        });

        await sendVerificationCode(payload.email, verificationCode, payload.username);

        const verifyMsg: WebSocketMessage<VerificationRequiredPayload> = {
            type: S2C_MSG_TYPE.VERIFICATION_REQUIRED,
            payload: { email: payload.email }
        };
        ws.send(JSON.stringify(verifyMsg));
        return true;
    }

    // --- Authentication: LOGIN ---
    else if (message.type === C2S_MSG_TYPE.LOGIN) {
        const payload = message.payload as LoginPayload;
        console.log(`Login attempt for: ${payload.email}`);
        
        const user = await prisma.user.findUnique({ where: { email: payload.email } });

        if (!user) {
            console.log('Login failed: User not found');
            const errorMsg: WebSocketMessage<AuthErrorPayload> = {
                type: S2C_MSG_TYPE.AUTH_ERROR,
                payload: { error: 'Invalid email or password' }
            };
            ws.send(JSON.stringify(errorMsg));
            return true;
        }
        
        if (!user.isVerified) {
                const verifyMsg: WebSocketMessage<VerificationRequiredPayload> = {
                type: S2C_MSG_TYPE.VERIFICATION_REQUIRED,
                payload: { email: user.email, message: 'Ваш аккаунт не подтвержден. Пожалуйста, подтвердите Email.' }
            };
            ws.send(JSON.stringify(verifyMsg));
            return true;
        }

        const passwordMatch = await bcrypt.compare(payload.password, user.password);

        if (!passwordMatch) {
            console.log('Login failed: Incorrect password');
            const errorMsg: WebSocketMessage<AuthErrorPayload> = {
                type: S2C_MSG_TYPE.AUTH_ERROR,
                payload: { error: 'Invalid email or password' }
            };
            ws.send(JSON.stringify(errorMsg));
            return true;
        }

        // Update token & status
        const token = uuidv4();
        await prisma.user.update({ where: { id: user.id }, data: { token: token, status: 'online' } });

        clients.set(ws, user.id);
        userConnections.set(user.id, ws);

        const enrichedUser = enrichUser(user);

        const successMsg: WebSocketMessage<AuthSuccessPayload> = {
            type: S2C_MSG_TYPE.AUTH_SUCCESS,
            payload: { 
                userId: user.id, 
                username: user.username, 
                discriminator: user.discriminator,
                email: user.email, 
                token: token,
                avatar: user.avatar,
                bio: user.bio,
                profile_banner: user.profile_banner,
                profile_theme: user.profile_theme,
                isDeveloper: enrichedUser.isDeveloper
            }
        };        ws.send(JSON.stringify(successMsg));

        const servers = await getUserServers(user.id);
        const channels = await prisma.channel.findMany();
        const voiceStates = await getVoiceStates();
        const initialState: InitialStatePayload = { servers, channels, voiceStates };
        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.INITIAL_STATE, payload: initialState }));

        const { unreadCounts, mentionCounts } = await calculateUnreadCounts(user.id, servers);
        ws.send(JSON.stringify({
            type: S2C_MSG_TYPE.UNREAD_COUNTS,
            payload: { unreadCounts, mentionCounts }
        }));
        return true;
    }

    // --- Authentication: LOGIN WITH TOKEN ---
    else if (message.type === C2S_MSG_TYPE.LOGIN_WITH_TOKEN) {
        const payload = message.payload as LoginWithTokenPayload;
        const user = await prisma.user.findFirst({ where: { token: payload.token } });

        if (!user) {
            const errorMsg: WebSocketMessage<AuthErrorPayload> = {
                type: S2C_MSG_TYPE.AUTH_ERROR,
                payload: { error: 'Invalid or expired token' }
            };
            ws.send(JSON.stringify(errorMsg));
            return true;
        }

        if (!user.isVerified) {
                const verifyMsg: WebSocketMessage<VerificationRequiredPayload> = {
                type: S2C_MSG_TYPE.VERIFICATION_REQUIRED,
                payload: { email: user.email, message: 'Ваш аккаунт не подтвержден. Пожалуйста, подтвердите Email.' }
            };
            ws.send(JSON.stringify(verifyMsg));
            return true;
        }

        // Update status
        await prisma.user.update({ where: { id: user.id }, data: { status: 'online' } });

        clients.set(ws, user.id);
        userConnections.set(user.id, ws);

        console.log(`User ${user.username} logged in with token.`);
        
        const enrichedUser = enrichUser(user);

        const successMsg: WebSocketMessage<AuthSuccessPayload> = {
            type: S2C_MSG_TYPE.AUTH_SUCCESS,
            payload: { 
                userId: user.id, 
                username: user.username, 
                discriminator: user.discriminator,
                email: user.email, 
                token: user.token, 
                avatar: user.avatar,
                bio: user.bio,
                profile_banner: user.profile_banner,
                profile_theme: user.profile_theme,
                isDeveloper: enrichedUser.isDeveloper // Include flag
            }
        };
        ws.send(JSON.stringify(successMsg));

        const servers = await getUserServers(user.id);
        const channels = await prisma.channel.findMany();
        const voiceStates = await getVoiceStates();
        const initialState: InitialStatePayload = { servers, channels, voiceStates };
        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.INITIAL_STATE, payload: initialState }));

        const { unreadCounts, mentionCounts } = await calculateUnreadCounts(user.id, servers);
        ws.send(JSON.stringify({
            type: S2C_MSG_TYPE.UNREAD_COUNTS,
            payload: { unreadCounts, mentionCounts }
        }));
        return true;
    }

    // --- Verify Email ---
    else if (message.type === C2S_MSG_TYPE.VERIFY_EMAIL) {
        const payload = message.payload as VerifyEmailPayload;
        const user = await prisma.user.findUnique({ where: { email: payload.email } });

        if (!user) {
            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.AUTH_ERROR, payload: { error: 'Пользователь не найден.' } }));
            return true;
        }

        if (String(user.verificationCode) !== String(payload.code)) {
            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.AUTH_ERROR, payload: { error: 'Неверный код подтверждения.' } }));
            return true;
        }

        // Code correct, verify user
        await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, verificationCode: null } });
        
        // --- AUTO-JOIN ALL PUBLIC SERVERS ---
        try {
            const publicServers = await prisma.server.findMany({ where: { isPublic: true } });
            console.log(`[Auth] Found ${publicServers.length} public servers for auto-join.`);
            
            for (const srv of publicServers) {
                const isAlreadyMember = await prisma.serverMember.findUnique({
                    where: { userId_serverId: { userId: user.id, serverId: srv.id } }
                });
                
                if (!isAlreadyMember) {
                    await prisma.serverMember.create({
                        data: {
                            userId: user.id,
                            serverId: srv.id,
                            joinedAt: BigInt(Date.now())
                        }
                    });
                    console.log(`[Auth] User ${user.username} auto-joined public server: ${srv.name} (${srv.id})`);

                    // Update Cache
                    const cachedMembers = serverMembersCache.get(srv.id);
                    if (cachedMembers) cachedMembers.add(user.id);

                    // --- BROADCAST MEMBER ADDED ---
                    const memberAddedPayload = {
                        serverId: srv.id,
                        member: {
                            id: user.id,
                            username: user.username,
                            discriminator: user.discriminator,
                            email: user.email,
                            avatar: user.avatar,
                            status: 'online', // User just verified, they are online
                            bio: user.bio,
                            profile_banner: user.profile_banner,
                            profile_theme: user.profile_theme,
                            roles: [], // New user has no roles
                            joinedAt: Date.now()
                        }
                    };

                    const broadcastMsg = {
                        type: S2C_MSG_TYPE.S2C_SERVER_MEMBER_ADDED,
                        payload: memberAddedPayload
                    };

                    clients.forEach((uid, clientWs) => {
                        // We could check if state.selectedServerId === srv.id, 
                        // but it's safer to send to everyone and let client filter
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify(broadcastMsg));
                        }
                    });
                }
            }
        } catch (e) {
            console.error("[Auth] Failed to auto-join public servers:", e);
        }
        // ------------------------------------

        clients.set(ws, user.id);
        userConnections.set(user.id, ws);

        const enrichedUser = enrichUser(user);

        const successMsg: WebSocketMessage<AuthSuccessPayload> = {
            type: S2C_MSG_TYPE.AUTH_SUCCESS,
            payload: { 
                userId: user.id, 
                username: user.username, 
                discriminator: user.discriminator, 
                email: user.email, 
                token: user.token, 
                avatar: user.avatar, 
                bio: user.bio, 
                profile_banner: user.profile_banner, 
                profile_theme: user.profile_theme,
                isDeveloper: enrichedUser.isDeveloper
            }
        };
        ws.send(JSON.stringify(successMsg));

        const servers = await getUserServers(user.id);
        const channels = await prisma.channel.findMany();
        const voiceStates = await getVoiceStates();
        const initialState: InitialStatePayload = { servers, channels, voiceStates };
        ws.send(JSON.stringify({ type: S2C_MSG_TYPE.INITIAL_STATE, payload: initialState }));

        const { unreadCounts, mentionCounts } = await calculateUnreadCounts(user.id, servers);
        ws.send(JSON.stringify({
            type: S2C_MSG_TYPE.UNREAD_COUNTS,
            payload: { unreadCounts, mentionCounts }
        }));
        return true;
    }

    // --- Resend Verification Code ---
    else if (message.type === C2S_MSG_TYPE.RESEND_VERIFICATION_CODE) {
        const payload = message.payload as ResendVerificationCodePayload;
        const user = await prisma.user.findUnique({ where: { email: payload.email } });

        if (!user) {
            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.AUTH_ERROR, payload: { error: 'Пользователь не найден.' } }));
            return true;
        }
        
        if (!user.isVerified) {
            ws.send(JSON.stringify({ type: S2C_MSG_TYPE.AUTH_ERROR, payload: { error: 'Аккаунт уже подтвержден.' } }));
            return true;
        }

                  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
                  await prisma.user.update({ where: { email: payload.email }, data: { verificationCode: newCode } });        await sendVerificationCode(user.email, newCode, user.username);

        const msg: WebSocketMessage<VerificationRequiredPayload> = {
            type: S2C_MSG_TYPE.VERIFICATION_CODE_SENT,
            payload: { email: user.email, message: 'Новый код подтверждения отправлен.' }
        };
        ws.send(JSON.stringify(msg));
        return true;
    }

    // --- Change Password ---
    else if (message.type === C2S_MSG_TYPE.CHANGE_PASSWORD) {
        const userId = clients.get(ws);
        if (!userId) return false;

        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser) return false; // Пользователь не найден, возможно устаревший токен

        const payload = message.payload as ChangePasswordPayload;
        
        const match = await bcrypt.compare(payload.oldPassword!, currentUser.password);
        if (!match) {
            const msg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.PASSWORD_CHANGED,
                payload: { success: false, error: 'Старый пароль неверен' }
            };
            ws.send(JSON.stringify(msg));
        } else {
            const hashedPassword = await bcrypt.hash(payload.newPassword, 10);
            const newToken = uuidv4(); // Invalidate old sessions
            await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword, token: newToken } });
            
            const msg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.PASSWORD_CHANGED,
                payload: { success: true }
            };
            ws.send(JSON.stringify(msg));
        }
        return true;
    }

    return false;
}
