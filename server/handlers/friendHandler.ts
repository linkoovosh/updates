import { WebSocket } from 'ws';
import { prisma } from '../prisma.js'; // NEW
import { clients, userConnections } from '../state.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    AddFriendPayload,
    FriendRequestSentPayload,
    FriendRequestReceivedPayload,
    FriendsListPayload,
    AcceptFriendRequestPayload,
    FriendRequestAcceptedPayload,
    RejectFriendRequestPayload,
    FriendRequestRejectedPayload,
    RemoveFriendPayload,
    FriendRemovedPayload,
    User
} from '../../murchat/common/types.js';

export async function handleFriendMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    // const db = getDb();

    // --- Add Friend ---
    if (parsedMessage.type === C2S_MSG_TYPE.ADD_FRIEND) {
        const payload = parsedMessage.payload as AddFriendPayload;
        console.log(`Processing Add Friend: ${payload.username}#${payload.discriminator} from ${currentUser.username}`);

        const targetUser = await prisma.user.findFirst({ where: { username: payload.username, discriminator: payload.discriminator } });

        if (!targetUser) {
            // TODO: Send error "User not found"
            console.log("Target user not found");
            return true;
        }
        if (targetUser.id === userId) {
            // TODO: Send error "Cannot add self"
            return true;
        }

        // Check if already friends
        const existingFriendship = await prisma.friend.findFirst({
            where: {
                OR: [
                    { user1Id: userId, user2Id: targetUser.id },
                    { user1Id: targetUser.id, user2Id: userId }
                ]
            }
        });

        if (existingFriendship) {
            console.log("Friendship already exists");
            return true; 
        }

        // Create Friendship (Pending)
        await prisma.friend.create({
            data: {
                user1Id: userId,
                user2Id: targetUser.id,
                status: 'pending',
                createdAt: BigInt(Date.now())
            }
        });

        // Notify Sender
        const sentMsg: WebSocketMessage<FriendRequestSentPayload> = {
            type: S2C_MSG_TYPE.FRIEND_REQUEST_SENT,
            payload: { toUserId: targetUser.id }
        };
        ws.send(JSON.stringify(sentMsg));

        // Notify Receiver
        const targetWs = userConnections.get(targetUser.id);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            const receivedMsg: WebSocketMessage<FriendRequestReceivedPayload> = {
                type: S2C_MSG_TYPE.FRIEND_REQUEST_RECEIVED,
                payload: { 
                    fromUser: { 
                        id: currentUser.id, 
                        username: currentUser.username, 
                        discriminator: currentUser.discriminator, 
                        email: currentUser.email, 
                        avatar: currentUser.avatar 
                    } 
                }
            };
            targetWs.send(JSON.stringify(receivedMsg));
        }
        return true;
    }

    // --- Get Friends List ---
    else if (parsedMessage.type === C2S_MSG_TYPE.GET_FRIENDS) {
        const relationships = await prisma.friend.findMany({
            where: {
                OR: [
                    { user1Id: userId },
                    { user2Id: userId }
                ]
            }
        });
        
        const friends: User[] = [];
        const incomingRequests: User[] = [];
        const outgoingRequests: User[] = [];

        for (const rel of relationships) {
            let otherUserId = rel.user1Id === userId ? rel.user2Id : rel.user1Id;
            const otherUser = await prisma.user.findUnique({ select: { id: true, username: true, discriminator: true, email: true, avatar: true, status: true }, where: { id: otherUserId } });
            
            if (!otherUser) continue;

            if (rel.status === 'accepted') {
                friends.push(otherUser);
            } else if (rel.status === 'pending') {
                if (rel.user1Id === userId) {
                    outgoingRequests.push(otherUser);
                } else {
                    incomingRequests.push(otherUser);
                }
            }
        }

        const response: WebSocketMessage<FriendsListPayload> = {
            type: S2C_MSG_TYPE.FRIENDS_LIST,
            payload: { friends, incomingRequests, outgoingRequests }
        };
        ws.send(JSON.stringify(response));
        return true;
    }

    // --- Accept Friend Request ---
    else if (parsedMessage.type === C2S_MSG_TYPE.ACCEPT_FRIEND_REQUEST) {
        const payload = parsedMessage.payload as AcceptFriendRequestPayload;
        const request = await prisma.friend.findFirst({
            where: {
                user1Id: payload.userId,
                user2Id: userId,
                status: 'pending'
            }
        });
        
        if (request) {
            await prisma.friend.update({
                where: {
                    user1Id_user2Id: { user1Id: payload.userId, user2Id: userId }
                },
                data: { status: 'accepted' }
            });
            
            const senderUser = await prisma.user.findUnique({ select: { id: true, username: true, discriminator: true, avatar: true, status: true, email: true }, where: { id: payload.userId } });
            
            if (senderUser) {
                const msgMe: WebSocketMessage<FriendRequestAcceptedPayload> = {
                    type: S2C_MSG_TYPE.FRIEND_REQUEST_ACCEPTED,
                    payload: { user: senderUser }
                };
                ws.send(JSON.stringify(msgMe));
            }

            const senderWs = userConnections.get(payload.userId);
            if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                const msgSender: WebSocketMessage<FriendRequestAcceptedPayload> = {
                    type: S2C_MSG_TYPE.FRIEND_REQUEST_ACCEPTED,
                    payload: { 
                        user: { 
                            id: currentUser.id, 
                            username: currentUser.username, 
                            discriminator: currentUser.discriminator, 
                            avatar: currentUser.avatar,
                            status: currentUser.status,
                            email: currentUser.email
                        } as User 
                    }
                };
                senderWs.send(JSON.stringify(msgSender));
            }
        }
        return true;
    }

    // --- Reject Friend Request ---
    else if (parsedMessage.type === C2S_MSG_TYPE.REJECT_FRIEND_REQUEST) {
        const payload = parsedMessage.payload as RejectFriendRequestPayload;
        await prisma.friend.deleteMany({
            where: {
                OR: [
                    { user1Id: payload.userId, user2Id: userId },
                    { user1Id: userId, user2Id: payload.userId }
                ]
            }
        });
        
        const msg: WebSocketMessage<FriendRequestRejectedPayload> = {
            type: S2C_MSG_TYPE.FRIEND_REQUEST_REJECTED,
            payload: { userId: payload.userId }
        };
        ws.send(JSON.stringify(msg));

        const otherWs = userConnections.get(payload.userId);
        if (otherWs && otherWs.readyState === WebSocket.OPEN) {
             const msgOther: WebSocketMessage<FriendRequestRejectedPayload> = {
                type: S2C_MSG_TYPE.FRIEND_REQUEST_REJECTED,
                payload: { userId: userId }
            };
            otherWs.send(JSON.stringify(msgOther));
        }
        return true;
    }

    // --- Remove Friend ---
    else if (parsedMessage.type === C2S_MSG_TYPE.REMOVE_FRIEND) {
        const payload = parsedMessage.payload as RemoveFriendPayload;
        
        await prisma.friend.deleteMany({
            where: {
                OR: [
                    { user1Id: userId, user2Id: payload.friendId },
                    { user1Id: payload.friendId, user2Id: userId }
                ],
                status: 'accepted'
            }
        });

        const msgMe: WebSocketMessage<FriendRemovedPayload> = {
            type: S2C_MSG_TYPE.FRIEND_REMOVED,
            payload: { friendId: payload.friendId }
        };
        ws.send(JSON.stringify(msgMe));

        const friendWs = userConnections.get(payload.friendId);
        if (friendWs && friendWs.readyState === WebSocket.OPEN) {
            const msgFriend: WebSocketMessage<FriendRemovedPayload> = {
                type: S2C_MSG_TYPE.FRIEND_REMOVED,
                payload: { friendId: userId }
            };
            friendWs.send(JSON.stringify(msgFriend));
        }
        return true;
    }

    return false;
}
