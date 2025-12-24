import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../prisma.js'; // NEW
import { clients, userConnections, voiceChannels, clientStates } from '../state.js';
import { getVoiceStates } from '../utils/dataUtils.js';
import { PERMISSIONS, hasPermission } from '../../murchat/common/permissions.js';

import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    Server,
    Channel,
    User,
    Invite,
    SetSelectedServerPayload,
    ServerMembersPayload,
    InviteCreatedPayload,
    InvitesListPayload,
    CreateInvitePayload,
    GetInvitesPayload,
    DeleteInvitePayload,
    CreateServerPayload,
    ServerCreatedPayload,
    DeleteServerPayload,
    ServerDeletedPayload,
    UpdateServerPayload,
    ServerUpdatedPayload,
    CreateChannelPayload,
    ChannelCreatedPayload,
    UpdateChannelPayload,
    ChannelUpdatedPayload,
    DeleteChannelPayload,
    LeaveServerPayload,
    UpdateServerProfilePayload,
    ServerMember,
    InitialStatePayload
} from '../../murchat/common/types.js';

async function getMemberPermissions(serverId: string, userId: string): Promise<bigint> {
    const server = await prisma.server.findUnique({ select: { ownerId: true }, where: { id: serverId } });
    if (!server) return 0n;
    if (server.ownerId === userId) return 1n << 0n; // Administrator (all permissions) for owner

    const userRoles = await prisma.userRole.findMany({
        where: {
            userId: userId,
            role: { serverId: serverId }
        },
        include: { role: true }
    });

    let permissions = 0n;
    for (const ur of userRoles) {
        if (ur.role.permissions) {
            permissions |= BigInt(ur.role.permissions);
        }
    }
    return permissions;
}

async function getMemberHighestRolePosition(serverId: string, userId: string): Promise<number> {
    const server = await prisma.server.findUnique({ select: { ownerId: true }, where: { id: serverId } });
    if (!server) return -1;
    if (server.ownerId === userId) return 999999; // Owner is highest

    const userRoles = await prisma.userRole.findMany({
        where: { userId: userId, role: { serverId: serverId } },
        include: { role: true }
    });

    if (userRoles.length === 0) return 0; // Base position

    return Math.max(...userRoles.map(ur => ur.role.position || 0));
}

export async function handleServerMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    // const db = getDb();

    // SET SELECTED SERVER
    if (parsedMessage.type === C2S_MSG_TYPE.SET_SELECTED_SERVER) {
        const payload = parsedMessage.payload as SetSelectedServerPayload;
        clientStates.set(userId, { selectedServerId: payload.selectedServerId });
        console.log(`User ${userId} selected server: ${payload.selectedServerId}`);

        if (payload.selectedServerId) {
                // --- AUTO-JOIN IF PUBLIC ---
                const server = await prisma.server.findUnique({ where: { id: payload.selectedServerId } });
                if (server && server.isPublic) {
                    const isMember = await prisma.serverMember.findUnique({
                        where: { userId_serverId: { userId, serverId: payload.selectedServerId } }
                    });
                    if (!isMember) {
                        await prisma.serverMember.create({
                            data: { userId, serverId: payload.selectedServerId, joinedAt: BigInt(Date.now()) }
                        });
                        console.log(`[ServerHandler] User ${userId} auto-joined public server ${payload.selectedServerId} on select.`);
                        
                        // Notify others that a new member joined
                        const memberAddedMsg = {
                            type: S2C_MSG_TYPE.S2C_SERVER_MEMBER_ADDED,
                            payload: {
                                serverId: payload.selectedServerId,
                                member: { ...currentUser, roles: [], joinedAt: Date.now(), status: 'online' }
                            }
                        };
                        clients.forEach((uid, clientWs) => {
                            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(memberAddedMsg));
                        });
                    }
                }
                // ---------------------------

                // 1. Fetch Server Roles
                const roles = await prisma.role.findMany({
                    where: { serverId: payload.selectedServerId },
                    orderBy: { position: 'asc' }
                });
                
                // Send Roles
                const rolesMsg: WebSocketMessage<any> = {
                    type: S2C_MSG_TYPE.S2C_SERVER_ROLES,
                    payload: { serverId: payload.selectedServerId, roles }
                };
                ws.send(JSON.stringify(rolesMsg));

                // 2. Fetch Members
                const membersRaw = await prisma.serverMember.findMany({
                    where: { serverId: payload.selectedServerId },
                    include: {
                        user: {
                            select: { id: true, username: true, discriminator: true, avatar: true, status: true, bio: true, profile_banner: true, profile_theme: true, email: true }
                        }
                    }
                });

                // 3. Fetch all member roles for this server
                const allUserRoles = await prisma.userRole.findMany({
                    where: {
                        role: {
                            serverId: payload.selectedServerId
                        }
                    }
                });

                const members: ServerMember[] = membersRaw.map(member => {
                    const userRoles = allUserRoles
                        .filter(ur => ur.userId === member.userId)
                        .map(ur => ur.roleId);
                    
                    return {
                        ...member.user, // member.user now includes email
                        joinedAt: member.joinedAt || null,
                        roles: userRoles,
                        // email is implicitly included from member.user due to the select statement
                    } as ServerMember;
                });

                const msg: WebSocketMessage<ServerMembersPayload> = {
                    type: S2C_MSG_TYPE.S2C_SERVER_MEMBERS,
                    payload: { serverId: payload.selectedServerId, members }
                };
                ws.send(JSON.stringify(msg));

                // 4. Send Voice States for this server (Who is in voice?)
                const voiceChannelsList = await prisma.channel.findMany({ 
                    where: { serverId: payload.selectedServerId, type: 'voice' },
                    select: { id: true }
                });
                
                const voiceChannelIds = new Set(voiceChannelsList.map(c => c.id));
                const serverVoiceStates: any[] = [];

                for (const [channelId, userIds] of voiceChannels.entries()) {
                    if (voiceChannelIds.has(channelId)) {
                        for (const uid of userIds) {
                            const user = await prisma.user.findUnique({ where: { id: uid } });
                            if (user) {
                                serverVoiceStates.push({
                                    userId: user.id,
                                    channelId: channelId,
                                    username: user.username,
                                    userAvatar: user.avatar
                                });
                            }
                        }
                    }
                }

                if (serverVoiceStates.length > 0) {
                    const voiceSyncMsg = {
                        type: S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE, // Fixed typo: added S2C_ prefix
                        payload: serverVoiceStates // Send ARRAY of states
                    };
                    ws.send(JSON.stringify(voiceSyncMsg));
                }
            }
        return true;
    }

    // GET SERVER MEMBERS (Explicit request)
    else if (parsedMessage.type === C2S_MSG_TYPE.GET_SERVER_MEMBERS) {
        try {
            const payload = parsedMessage.payload as any;
            const serverId = payload.serverId;

            console.log(`[ServerHandler] Processing GET_SERVER_MEMBERS for server: ${serverId}`);

            if (serverId) {
                // --- AUTO-JOIN IF PUBLIC (Double Check) ---
                const server = await prisma.server.findUnique({ where: { id: serverId } });
                if (server && server.isPublic) {
                    const isMember = await prisma.serverMember.findUnique({
                        where: { userId_serverId: { userId, serverId } }
                    });
                    if (!isMember) {
                        await prisma.serverMember.create({
                            data: { userId, serverId, joinedAt: BigInt(Date.now()) }
                        });
                        console.log(`[ServerHandler] User ${userId} auto-joined public server ${serverId} on GET_MEMBERS.`);
                        
                        // Notify others
                        const memberAddedMsg = {
                            type: S2C_MSG_TYPE.S2C_SERVER_MEMBER_ADDED,
                            payload: {
                                serverId: serverId,
                                member: { ...currentUser, roles: [], joinedAt: Date.now(), status: 'online' }
                            }
                        };
                        clients.forEach((uid, clientWs) => {
                            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(memberAddedMsg));
                        });
                    }
                }
                // -------------------------------------------

                // 1. Fetch Server Roles
                const roles = await prisma.role.findMany({
                    where: { serverId: serverId },
                    orderBy: { position: 'asc' }
                });
                console.log(`[ServerHandler] Found ${roles.length} roles for server ${serverId}`);
                
                // Send Roles
                const rolesMsg: WebSocketMessage<any> = {
                    type: S2C_MSG_TYPE.S2C_SERVER_ROLES,
                    payload: { serverId: serverId, roles }
                };
                ws.send(JSON.stringify(rolesMsg));

                // 2. Fetch Members
                const membersRaw = await prisma.serverMember.findMany({
                    where: { serverId: serverId },
                    include: {
                        user: {
                            select: { id: true, username: true, discriminator: true, avatar: true, status: true, bio: true, profile_banner: true, profile_theme: true, email: true }
                        }
                    }
                });
                console.log(`[ServerHandler] Found ${membersRaw.length} raw members for server ${serverId}`);

                // 3. Fetch all member roles for this server
                const allUserRoles = await prisma.userRole.findMany({
                    where: {
                        role: {
                            serverId: serverId
                        }
                    }
                });

                const members: ServerMember[] = membersRaw.map(member => {
                    const userRoles = allUserRoles
                        .filter(ur => ur.userId === member.userId)
                        .map(ur => ur.roleId);
                    
                    return {
                        ...member.user,
                        joinedAt: member.joinedAt || null,
                        roles: userRoles,
                    } as ServerMember;
                });

                const msg: WebSocketMessage<ServerMembersPayload> = {
                    type: S2C_MSG_TYPE.S2C_SERVER_MEMBERS,
                    payload: { serverId: serverId, members }
                };
                ws.send(JSON.stringify(msg));
                console.log(`[ServerHandler] Sent ${members.length} members to client.`);
            }
        } catch (error) {
            console.error('[ServerHandler] Error in GET_SERVER_MEMBERS:', error);
        }
        return true;
    }

    // --- Role Management ---
    else if (parsedMessage.type === C2S_MSG_TYPE.CREATE_ROLE) {
        const payload = parsedMessage.payload as any;
        const perms = await getMemberPermissions(payload.serverId, userId);
        
        if (hasPermission(perms, PERMISSIONS.MANAGE_ROLES)) {
            const newRole = {
                id: uuidv4(),
                serverId: payload.serverId,
                name: payload.name || 'New Role',
                color: payload.color || '#99aab5',
                position: 0,
                permissions: '0' // Default permissions as string
            };
            await prisma.role.create({
                data: {
                    id: newRole.id,
                    serverId: newRole.serverId,
                    name: newRole.name,
                    color: newRole.color,
                    position: newRole.position,
                    permissions: newRole.permissions
                }
            });
            
            const msg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.S2C_ROLE_CREATED,
                payload: { role: newRole }
            };
            clients.forEach((uid, clientWs) => {
                const state = clientStates.get(uid);
                if (state && state.selectedServerId === payload.serverId && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(msg));
                }
            });
        } else {
            console.warn(`User ${userId} tried to CREATE_ROLE without MANAGE_ROLES permission.`);
        }
        return true;
    }
    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_ROLE) {
        const payload = parsedMessage.payload as any;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_ROLES)) {
            const dataToUpdate: { name?: string; color?: string; permissions?: string; position?: number } = {};
            if (payload.name) { dataToUpdate.name = payload.name; }
            if (payload.color) { dataToUpdate.color = payload.color; }
            if (payload.permissions !== undefined) { dataToUpdate.permissions = String(payload.permissions); }
            if (payload.position !== undefined) { dataToUpdate.position = payload.position; }
            
            if (Object.keys(dataToUpdate).length > 0) {
                await prisma.role.update({
                    where: { id: payload.roleId },
                    data: dataToUpdate
                });
                
                const updatedRole = await prisma.role.findUnique({ where: { id: payload.roleId } });
                const msg: WebSocketMessage<any> = {
                    type: S2C_MSG_TYPE.S2C_ROLE_UPDATED,
                    payload: { role: updatedRole }
                };
                clients.forEach((uid, clientWs) => {
                    const state = clientStates.get(uid);
                    if (state && state.selectedServerId === payload.serverId && clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify(msg));
                    }
                });
            }
        } else {
            console.warn(`User ${userId} tried to UPDATE_ROLE without MANAGE_ROLES permission.`);
        }
        return true;
    }
    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_ROLE) {
        const payload = parsedMessage.payload as any;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_ROLES)) {
            await prisma.role.delete({ where: { id: payload.roleId } });
            await prisma.userRole.deleteMany({ where: { roleId: payload.roleId } });
            
            const msg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.S2C_ROLE_DELETED,
                payload: { roleId: payload.roleId, serverId: payload.serverId }
            };
            clients.forEach((uid, clientWs) => {
                const state = clientStates.get(uid);
                if (state && state.selectedServerId === payload.serverId && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(msg));
                }
            });
        } else {
            console.warn(`User ${userId} tried to DELETE_ROLE without MANAGE_ROLES permission.`);
        }
        return true;
    }
    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_MEMBER_ROLES) {
        const payload = parsedMessage.payload as any;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_ROLES)) {
            const serverRoles = await prisma.role.findMany({ select: { id: true }, where: { serverId: payload.serverId } });
            const serverRoleIds = serverRoles.map(r => r.id);
            
            // Delete existing roles for the user on this server
            await prisma.userRole.deleteMany({
                where: {
                    userId: payload.userId,
                    roleId: { in: serverRoleIds }
                }
            });
            
            // Add new roles
            const rolesToConnect = payload.roleIds.filter((roleId: string) => serverRoleIds.includes(roleId));
            if (rolesToConnect.length > 0) {
                await prisma.userRole.createMany({
                    data: rolesToConnect.map((roleId: string) => ({
                        userId: payload.userId,
                        roleId: roleId
                    }))
                });
            }
            
            const msg: WebSocketMessage<any> = {
                type: S2C_MSG_TYPE.S2C_MEMBER_ROLES_UPDATED,
                payload: { serverId: payload.serverId, userId: payload.userId, roleIds: payload.roleIds }
            };
            clients.forEach((uid, clientWs) => {
                const state = clientStates.get(uid);
                if (state && state.selectedServerId === payload.serverId && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(msg));
                }
            });
        } else {
            console.warn(`User ${userId} tried to UPDATE_MEMBER_ROLES without MANAGE_ROLES permission.`);
        }
        return true;
    }

    // --- Invite Handling ---
    else if (parsedMessage.type === C2S_MSG_TYPE.CREATE_INVITE) {
        const payload = parsedMessage.payload as CreateInvitePayload;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.CREATE_INVITE)) {
            const code = uuidv4().substring(0, 8);
            const expiresAt = payload.expiresAt ? BigInt(Date.now()) + BigInt(payload.expiresAt * 1000) : null;
            const createdAt = BigInt(Date.now());

            await prisma.invite.create({
                data: {
                    id: uuidv4(),
                    code: code,
                    serverId: payload.serverId,
                    channelId: payload.channelId || null,
                    authorId: userId,
                    maxUses: payload.maxUses || null,
                    uses: 0,
                    expiresAt: expiresAt,
                    defaultRoleId: payload.defaultRoleId || null,
                    temporary: payload.temporary ? 1 : 0,
                    createdAt: createdAt
                }
            });

            const newInvite = await prisma.invite.findUnique({ where: { code: code } });
            const notification: WebSocketMessage<InviteCreatedPayload> = {
                type: S2C_MSG_TYPE.S2C_INVITE_CREATED,
                payload: { invite: newInvite as Invite }
            };
            ws.send(JSON.stringify(notification));
        } else {
            console.warn(`User ${userId} tried to CREATE_INVITE without permission.`);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.GET_INVITES) {
        const payload = parsedMessage.payload as GetInvitesPayload;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_SERVER)) {
            const invites = await prisma.invite.findMany({ where: { serverId: payload.serverId } });
            const notification: WebSocketMessage<InvitesListPayload> = {
                type: S2C_MSG_TYPE.S2C_INVITES_LIST,
                payload: { invites: invites }
            };
            ws.send(JSON.stringify(notification));
        } else {
            console.warn(`User ${userId} tried to GET_INVITES without MANAGE_SERVER permission.`);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_INVITE) {
        const payload = parsedMessage.payload as DeleteInvitePayload;
        const invite = await prisma.invite.findUnique({ select: { serverId: true, authorId: true }, where: { code: payload.code } });
        
        if (!invite) return true;
        
        const perms = await getMemberPermissions(invite.serverId, userId);

        if (invite.authorId === userId || hasPermission(perms, PERMISSIONS.MANAGE_SERVER)) {
            await prisma.invite.delete({ where: { code: payload.code } });
            console.log(`Invite ${payload.code} deleted by user ${userId}`);

            const invites = await prisma.invite.findMany({ where: { serverId: invite.serverId } });
            const notification: WebSocketMessage<InvitesListPayload> = {
                type: S2C_MSG_TYPE.S2C_INVITES_LIST,
                payload: { invites: invites }
            };
            ws.send(JSON.stringify(notification));
        } else {
            console.warn(`User ${userId} tried to DELETE_INVITE without permission.`);
        }
        return true;
    }

    // --- Server Handling ---
    else if (parsedMessage.type === C2S_MSG_TYPE.LEAVE_SERVER) {
        const payload = parsedMessage.payload as LeaveServerPayload;
        console.log(`User ${userId} attempting to leave server ${payload.serverId}`);

        await prisma.serverMember.deleteMany({ where: { userId: userId, serverId: payload.serverId } });
        console.log(`User ${userId} left server ${payload.serverId}`);

        const serverDeletedNotification: WebSocketMessage<ServerDeletedPayload> = {
            type: S2C_MSG_TYPE.SERVER_DELETED,
            payload: { serverId: payload.serverId }
        };
        clients.forEach((userIdFromMap, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(serverDeletedNotification));
        });
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.CREATE_SERVER) {
        try {
            const payload = parsedMessage.payload as CreateServerPayload;
            const newServer: Server = {
                id: uuidv4(),
                name: payload.name,
                ownerId: userId,
                isPublic: false,
                avatar_default: 'defaul_server_avatars.png',
                avatar_active: 'open_server_avatars.png',
            };
            await prisma.server.create({
                data: {
                    id: newServer.id,
                    name: newServer.name,
                    ownerId: newServer.ownerId,
                    isPublic: newServer.isPublic,
                    avatar_default: newServer.avatar_default,
                    avatar_active: newServer.avatar_active,
                    createdAt: BigInt(Date.now())
                }
            });
            
            // The server creation itself is handled by prisma.server.create already.
            // This replaces the db.run for server_members
            await prisma.serverMember.create({
                data: {
                    userId: userId,
                    serverId: newServer.id,
                    joinedAt: BigInt(Date.now())
                }
            });

            console.log(`Server created: ${newServer.name} (${newServer.id}) by ${userId}`);

            const serverCreatedNotification: WebSocketMessage<ServerCreatedPayload> = {
                type: S2C_MSG_TYPE.SERVER_CREATED,
                payload: { server: newServer }
            };
            
            ws.send(JSON.stringify(serverCreatedNotification));
        } catch (e) {
            console.error("FAILED TO CREATE SERVER:", e);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_SERVER) {
        const payload = parsedMessage.payload as DeleteServerPayload;
        console.log(`Received DELETE_SERVER request for ${payload.serverId} from ${userId}`);
        
        const server = await prisma.server.findUnique({ where: { id: payload.serverId } });
        if (!server) {
            console.error('Server not found:', payload.serverId);
            return true;
        }

        const requestUser = await prisma.user.findUnique({ where: { id: userId } });
        const isSuperAdmin = requestUser && requestUser.username === 'Linko' && requestUser.discriminator === '8885';
        
        let canDelete = false;

        if (isSuperAdmin) {
            console.log(`SUPERUSER ACTION: Linko#8885 (${userId}) is deleting server ${payload.serverId}.`);
            canDelete = true;
        } else if (server.ownerId === userId) {
            canDelete = true;
        } else {
            console.warn(`User ${userId} attempted to delete server ${payload.serverId} without permission (Owner: ${server.ownerId}).`);
        }

        if (canDelete) {
            await prisma.channel.deleteMany({ where: { serverId: payload.serverId } });
            await prisma.invite.deleteMany({ where: { serverId: payload.serverId } });
            await prisma.serverMember.deleteMany({ where: { serverId: payload.serverId } });
            await prisma.server.delete({ where: { id: payload.serverId } });
            
            console.log(`Server deleted successfully: ${payload.serverId}`);

            const serverDeletedNotification: WebSocketMessage<ServerDeletedPayload> = {
                type: S2C_MSG_TYPE.SERVER_DELETED,
                payload: { serverId: payload.serverId }
            };
            
            clients.forEach((userIdFromMap, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(serverDeletedNotification));
            });
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_SERVER) {
        const payload = parsedMessage.payload as UpdateServerPayload;
        console.log(`Received UPDATE_SERVER request for ${payload.serverId} from ${userId}`);
        
        const server = await prisma.server.findUnique({ where: { id: payload.serverId } });

        if (!server) {
            console.error('Server not found:', payload.serverId);
            return true;
        }

        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_SERVER)) {
            const dataToUpdate: any = {};
            if (payload.name !== undefined) dataToUpdate.name = payload.name;
            if (payload.isPublic !== undefined) dataToUpdate.isPublic = payload.isPublic;
            if (payload.description !== undefined) dataToUpdate.description = payload.description;
            if (payload.banner !== undefined) dataToUpdate.banner = payload.banner;
            if (payload.systemChannelId !== undefined) dataToUpdate.systemChannelId = payload.systemChannelId;
            if (payload.verificationLevel !== undefined) dataToUpdate.verificationLevel = payload.verificationLevel;

            await prisma.server.update({
                where: { id: payload.serverId },
                data: dataToUpdate
            });
            
            const updatedServer = await prisma.server.findUnique({ where: { id: payload.serverId } });

            if (updatedServer) {
                const serverUpdatedNotification: WebSocketMessage<ServerUpdatedPayload> = {
                    type: S2C_MSG_TYPE.SERVER_UPDATED,
                    payload: { server: updatedServer }
                };
                
                clients.forEach((userIdFromMap, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(serverUpdatedNotification));
                });
            }
        } else {
            console.warn(`User ${userId} tried to UPDATE_SERVER without MANAGE_SERVER permission.`);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_SERVER_PROFILE) {
        const payload = parsedMessage.payload as UpdateServerProfilePayload;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_SERVER)) {
            const dataToUpdate: any = {};
            if (payload.avatar_default !== undefined) dataToUpdate.avatar_default = payload.avatar_default;
            if (payload.avatar_active !== undefined) dataToUpdate.avatar_active = payload.avatar_active;

            if (Object.keys(dataToUpdate).length > 0) {
                await prisma.server.update({
                    where: { id: payload.serverId },
                    data: dataToUpdate
                });
                
                const updatedServer = await prisma.server.findUnique({ where: { id: payload.serverId } });
                if (updatedServer) {
                    const msg: WebSocketMessage<ServerUpdatedPayload> = {
                        type: S2C_MSG_TYPE.SERVER_UPDATED,
                        payload: { server: updatedServer }
                    };
                    clients.forEach((uid, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify(msg));
                        }
                    });
                }
            }
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.CREATE_CHANNEL) {
        const payload = parsedMessage.payload as CreateChannelPayload;
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_CHANNELS)) {
            const newChannel: Channel = {
                id: uuidv4(),
                serverId: payload.serverId,
                name: payload.name,
                type: payload.type,
                isPrivate: payload.isPrivate,
            };
            await prisma.channel.create({
                data: {
                    id: newChannel.id,
                    serverId: newChannel.serverId,
                    name: newChannel.name,
                    type: newChannel.type,
                    isPrivate: newChannel.isPrivate,
                    position: newChannel.position // Assuming newChannel.position exists and is correct
                }
            });

            const channelCreatedNotification: WebSocketMessage<ChannelCreatedPayload> = {
                type: S2C_MSG_TYPE.CHANNEL_CREATED,
                payload: { channel: newChannel }
            };
            
            clients.forEach((userIdFromMap, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(channelCreatedNotification));
            });
        } else {
            console.warn(`User ${userId} tried to CREATE_CHANNEL without MANAGE_CHANNELS permission.`);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_CHANNEL) {
        const payload = parsedMessage.payload as UpdateChannelPayload; // Declare payload
        const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } }); // Declare channel
        
        if (!channel) return true;

        const perms = await getMemberPermissions(channel.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_CHANNELS)) {
            const dataToUpdate: { name?: string; isPrivate?: boolean } = {}; // Declare dataToUpdate
            if (payload.name) { dataToUpdate.name = payload.name; }
            if (payload.isPrivate !== undefined) { dataToUpdate.isPrivate = payload.isPrivate; }

            if (Object.keys(dataToUpdate).length > 0) {
                await prisma.channel.update({
                    where: { id: payload.channelId },
                    data: dataToUpdate
                });
                
                const updatedChannel = await prisma.channel.findUnique({ where: { id: payload.channelId } });            
                if (updatedChannel) {
                    const notification: WebSocketMessage<ChannelUpdatedPayload> = {
                        type: S2C_MSG_TYPE.CHANNEL_UPDATED,
                        payload: { channel: updatedChannel }
                    };
                    
                    clients.forEach((userIdFromMap, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(notification));
                    });
                }
            }
        } else {
            console.warn(`User ${userId} tried to UPDATE_CHANNEL without MANAGE_CHANNELS permission.`);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.DELETE_CHANNEL) {
        const payload = parsedMessage.payload as DeleteChannelPayload;
        const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
        
        if (!channel) return true;

        const perms = await getMemberPermissions(channel.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.MANAGE_CHANNELS)) {
            await prisma.channel.delete({ where: { id: payload.channelId } });
            
            const notification: WebSocketMessage<DeleteChannelPayload> = {
                type: S2C_MSG_TYPE.CHANNEL_DELETED,
                payload: { channelId: payload.channelId }
            };
            
            clients.forEach((userIdFromMap, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(notification));
            });
        } else {
            console.warn(`User ${userId} tried to DELETE_CHANNEL without MANAGE_CHANNELS permission.`);
        }
        return true;
    }
    
    // --- Update Profile (User) ---
    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_PROFILE) {
        const payload = parsedMessage.payload as any; // UpdateProfilePayload
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
        
        if (somethingChanged) {
            currentUser = await prisma.user.findUnique({ where: { id: userId } });

            const userUpdatedPayload: any = { // UserUpdatedPayload
                userId: currentUser.id,
                user: {
                    id: currentUser.id,
                    username: currentUser.username,
                    discriminator: currentUser.discriminator,
                    email: currentUser.email,
                    avatar: currentUser.avatar,
                    bio: currentUser.bio,
                    profile_banner: currentUser.profile_banner,
                    status: currentUser.status,
                }
            };

            const userUpdatedMessage: WebSocketMessage<any> = { // UserUpdatedPayload
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

    // --- Update Status (User) ---
    else if (parsedMessage.type === C2S_MSG_TYPE.UPDATE_STATUS) {
        const payload = parsedMessage.payload as any; // UpdateStatusPayload
        await prisma.user.update({ where: { id: userId }, data: { status: payload.status } });

        const presenceUpdate: WebSocketMessage<any> = { // PresenceUpdatePayload
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
    
    // --- Invite Friends to Server ---
    else if (parsedMessage.type === C2S_MSG_TYPE.INVITE_FRIENDS_TO_SERVER) {
        const payload = parsedMessage.payload as any; // InviteFriendsToServerPayload
        console.log(`User ${userId} attempting to invite friends ${payload.friendIds} to server ${payload.serverId}`);

        const server = await prisma.server.findUnique({ select: { id: true, ownerId: true }, where: { id: payload.serverId } });
        if (!server || server.ownerId !== userId) {
            console.warn(`User ${userId} attempted to invite to server ${payload.serverId} without permission.`);
            return true;
        }

        for (const friendId of payload.friendIds) {
            const isMember = await prisma.serverMember.findUnique({ where: { userId_serverId: { userId: friendId, serverId: payload.serverId } } });
            if (isMember) {
                console.log(`Friend ${friendId} is already a member of server ${payload.serverId}. Skipping.`);
                continue;
            }

            await prisma.serverMember.create({ data: { userId: friendId, serverId: payload.serverId, joinedAt: BigInt(Date.now()) } });
            console.log(`Friend ${friendId} added to server ${payload.serverId}.`);

            const friendWs = userConnections.get(friendId);
            if (friendWs && friendWs.readyState === WebSocket.OPEN) {
                const friendServers = await prisma.server.findMany({
                    where: {
                        OR: [
                            { members: { some: { userId: friendId } } },
                            { isPublic: true }
                        ]
                    }
                });
                const friendChannels = await prisma.channel.findMany();
                // 3. Fetch Voice States
                const allVoiceStates = await getVoiceStates();
                const initialState: InitialStatePayload = { 
                    servers: [server as any], 
                    channels: await prisma.channel.findMany({ where: { serverId: (server as any).id } }), 
                    voiceStates: allVoiceStates 
                };
                friendWs.send(JSON.stringify({ type: S2C_MSG_TYPE.INITIAL_STATE, payload: initialState }));
                console.log(`Sent updated INITIAL_STATE to friend ${friendId}`);
            }
        }
        return true;
    }

    // --- Kick / Ban Handling ---
    else if (parsedMessage.type === C2S_MSG_TYPE.KICK_MEMBER) {
        const payload = parsedMessage.payload as any; // KickMemberPayload
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.KICK_MEMBERS)) {
            const targetHighestRole = await getMemberHighestRolePosition(payload.serverId, payload.userId);
            const myHighestRole = await getMemberHighestRolePosition(payload.serverId, userId);

            if (myHighestRole > targetHighestRole) {
                await prisma.serverMember.deleteMany({
                    where: { userId: payload.userId, serverId: payload.serverId }
                });
                
                const msg: WebSocketMessage<any> = {
                    type: S2C_MSG_TYPE.S2C_SERVER_MEMBER_REMOVED,
                    payload: { serverId: payload.serverId, userId: payload.userId }
                };
                
                clients.forEach((uid, clientWs) => {
                    const state = clientStates.get(uid);
                    // Notify everyone on the server, plus the kicked user if they were looking at it
                    if (clientWs.readyState === WebSocket.OPEN) {
                         clientWs.send(JSON.stringify(msg));
                    }
                });
                console.log(`User ${userId} kicked ${payload.userId} from server ${payload.serverId}`);
            } else {
                console.warn(`User ${userId} tried to kick ${payload.userId} but has lower/equal role position.`);
            }
        } else {
            console.warn(`User ${userId} tried to KICK_MEMBER without permission.`);
        }
        return true;
    }

    else if (parsedMessage.type === C2S_MSG_TYPE.BAN_MEMBER) {
        const payload = parsedMessage.payload as any; // BanMemberPayload
        const perms = await getMemberPermissions(payload.serverId, userId);

        if (hasPermission(perms, PERMISSIONS.BAN_MEMBERS)) {
            const targetHighestRole = await getMemberHighestRolePosition(payload.serverId, payload.userId);
            const myHighestRole = await getMemberHighestRolePosition(payload.serverId, userId);

            if (myHighestRole > targetHighestRole) {
                // Create Ban Record
                await prisma.serverBan.create({
                    data: {
                        serverId: payload.serverId,
                        userId: payload.userId,
                        reason: payload.reason,
                        executorId: userId,
                        createdAt: BigInt(Date.now())
                    }
                });

                // Remove member
                await prisma.serverMember.deleteMany({
                    where: { userId: payload.userId, serverId: payload.serverId }
                });
                
                const msg: WebSocketMessage<any> = {
                    type: S2C_MSG_TYPE.S2C_SERVER_MEMBER_REMOVED,
                    payload: { serverId: payload.serverId, userId: payload.userId }
                };
                
                clients.forEach((uid, clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                         clientWs.send(JSON.stringify(msg));
                    }
                });
                console.log(`User ${userId} banned ${payload.userId} from server ${payload.serverId}`);
            } else {
                console.warn(`User ${userId} tried to ban ${payload.userId} but has lower/equal role position.`);
            }
        } else {
            console.warn(`User ${userId} tried to BAN_MEMBER without permission.`);
        }
        return true;
    }

    return false;
}
