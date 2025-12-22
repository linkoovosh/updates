import { prisma } from '../prisma.js'; // UPDATED
import { voiceChannels } from '../state.js';
import type { Server, Channel, User } from '../../murchat/common/types.js';

export async function calculateUnreadCounts(userId: string, servers: Server[]) {
    const unreadCounts: Record<string, number> = {};
    const mentionCounts: Record<string, number> = {}; 
    
    for (const server of servers) {
        const serverChannels = await prisma.channel.findMany({ where: { serverId: server.id } });
        for (const channel of serverChannels) {
            const readState = await prisma.userReadState.findUnique({
                where: { userId_channelId: { userId: userId, channelId: channel.id } },
                select: { lastReadTimestamp: true }
            });
            const lastRead = readState ? Number(readState.lastReadTimestamp) : 0; // BigInt to Number
            
            const count = await prisma.channelMessage.count({
                where: { channelId: channel.id, timestamp: { gt: BigInt(lastRead) } }
            });
            
            if (count > 0) {
                unreadCounts[channel.id] = count;
            }
        }
    }
    return { unreadCounts, mentionCounts };
}

export async function getVoiceStates() {
    const states: { userId: string; channelId: string; username?: string; userAvatar?: string }[] = [];
    
    for (const [channelId, members] of voiceChannels.entries()) {
        for (const memberId of members) {
            try {
                const user = await prisma.user.findUnique({ select: { username: true, avatar: true }, where: { id: memberId } });
                if (user) {
                    states.push({
                        userId: memberId,
                        channelId,
                        username: user.username,
                        userAvatar: user.avatar || undefined
                    });
                }
            } catch (e) {
                console.error(`Failed to fetch user info for voice state: ${memberId}`, e);
            }
        }
    }
    return states;
}

export async function getUserServers(userId: string) {
    const memberServerMemberships = await prisma.serverMember.findMany({
        where: { userId: userId },
        select: { serverId: true }
    });
    const memberServerIds = memberServerMemberships.map((m: { serverId: string }) => m.serverId);

    const servers = await prisma.server.findMany({
        where: {
            OR: [
                { isPublic: true },
                { id: { in: memberServerIds } }
            ]
        }
    });

    return servers;
}
