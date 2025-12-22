import { WebSocket } from 'ws';
import { prisma } from '../prisma.js'; // NEW
import { userConnections } from '../state.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    CallRequestPayload,
    CallResponsePayload,
    CallHangupPayload,
    IncomingCallPayload,
    S2CCallResponsePayload,
    CallEndedPayload,
    User
} from '../../murchat/common/types.js';

export async function handleCallMessage(ws: WebSocket, parsedMessage: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    // const db = getDb(); // Using Prisma

    // --- 1-on-1 Voice Call Signaling ---
    if (parsedMessage.type === C2S_MSG_TYPE.CALL_REQUEST) {
        const payload = parsedMessage.payload as CallRequestPayload;
        const { recipientId } = payload;
        const recipientWs = userConnections.get(recipientId);

        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            const callerUser = await prisma.user.findUnique({ select: { id: true, username: true, discriminator: true, avatar: true, email: true }, where: { id: userId } });
            
            if (callerUser) {
                const incomingPayload: IncomingCallPayload = { caller: callerUser };
                const msg: WebSocketMessage<IncomingCallPayload> = {
                    type: S2C_MSG_TYPE.INCOMING_CALL,
                    payload: incomingPayload
                };
                recipientWs.send(JSON.stringify(msg));
                console.log(`[Call] Relayed call request from ${userId} to ${recipientId}`);
            }
        } else {
            const msg: WebSocketMessage<CallEndedPayload> = {
                type: S2C_MSG_TYPE.CALL_ENDED,
                payload: { reason: 'User is offline' }
            };
            ws.send(JSON.stringify(msg));
        }
        return true;
    }
    else if (parsedMessage.type === C2S_MSG_TYPE.CALL_RESPONSE) {
        const payload = parsedMessage.payload as CallResponsePayload;
        const { callerId, accepted } = payload;
        const callerWs = userConnections.get(callerId);

        if (callerWs && callerWs.readyState === WebSocket.OPEN) {
            const responsePayload: S2CCallResponsePayload = {
                responderId: userId,
                accepted
            };
            const msg: WebSocketMessage<S2CCallResponsePayload> = {
                type: S2C_MSG_TYPE.CALL_RESPONSE,
                payload: responsePayload
            };
            callerWs.send(JSON.stringify(msg));
            console.log(`[Call] Relayed call response (${accepted}) from ${userId} to ${callerId}`);
        }
        return true;
    }
    else if (parsedMessage.type === C2S_MSG_TYPE.CALL_HANGUP) {
        const payload = parsedMessage.payload as CallHangupPayload;
        const { recipientId } = payload;
        const otherWs = userConnections.get(recipientId);
        
        if (otherWs && otherWs.readyState === WebSocket.OPEN) {
            const msg: WebSocketMessage<CallEndedPayload> = {
                type: S2C_MSG_TYPE.CALL_ENDED,
                payload: { reason: 'Call ended' }
            };
            otherWs.send(JSON.stringify(msg));
            console.log(`[Call] Relayed hangup from ${userId} to ${recipientId}`);
        }
        return true;
    }

    return false;
}
