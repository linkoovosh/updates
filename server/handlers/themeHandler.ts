import { WebSocket } from 'ws';
import { prisma } from '../prisma.js';
import { clients } from '../state.js';
import {
    C2S_MSG_TYPE,
    S2C_MSG_TYPE,
    WebSocketMessage,
    CreateThemePayload,
    ThemesListPayload,
    ThemeCreatedPayload,
    DeleteThemePayload,
    ThemeDeletedPayload,
    UpdateThemePayload, // NEW
    ThemeUpdatedPayload // NEW
} from '../../murchat/common/types.js';
import { v4 as uuidv4 } from 'uuid';

export async function handleThemeMessage(ws: WebSocket, message: WebSocketMessage<unknown>, userId: string, currentUser: any): Promise<boolean> {
    if (message.type === C2S_MSG_TYPE.CREATE_THEME) {
        const payload = message.payload as CreateThemePayload;
        const newThemeId = uuidv4();

        const newTheme = await prisma.theme.create({
            data: {
                id: newThemeId,
                name: payload.name,
                authorId: userId,
                authorName: currentUser.username,
                config: JSON.stringify(payload.config),
                isPublic: true,
                createdAt: BigInt(Date.now())
            }
        });

        // Broadcast to ALL users
        const broadcastMsg: WebSocketMessage<ThemeCreatedPayload> = {
            type: S2C_MSG_TYPE.THEME_CREATED,
            payload: {
                theme: {
                    ...newTheme,
                    config: JSON.parse(newTheme.config),
                    createdAt: Number(newTheme.createdAt)
                }
            }
        };

        const msgString = JSON.stringify(broadcastMsg);
        clients.forEach((_, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msgString);
            }
        });

        return true;
    }

    if (message.type === C2S_MSG_TYPE.UPDATE_THEME) {
        const payload = message.payload as UpdateThemePayload;
        
        // Find existing theme
        const existingTheme = await prisma.theme.findUnique({ where: { id: payload.themeId } });
        
        if (!existingTheme) return false;
        
        // Ensure ownership
        if (existingTheme.authorId !== userId) {
            // Alternatively, could send an error message back
            return false;
        }

        const updatedTheme = await prisma.theme.update({
            where: { id: payload.themeId },
            data: {
                name: payload.name || existingTheme.name,
                config: payload.config ? JSON.stringify(payload.config) : existingTheme.config
            }
        });

        // Broadcast Update
        const broadcastMsg: WebSocketMessage<ThemeUpdatedPayload> = {
            type: S2C_MSG_TYPE.THEME_UPDATED,
            payload: {
                theme: {
                    ...updatedTheme,
                    config: JSON.parse(updatedTheme.config),
                    createdAt: Number(updatedTheme.createdAt)
                }
            }
        };

        const msgString = JSON.stringify(broadcastMsg);
        clients.forEach((_, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msgString);
            }
        });

        return true;
    }

    if (message.type === C2S_MSG_TYPE.GET_THEMES) {
        const themes = await prisma.theme.findMany({
            where: { isPublic: true },
            orderBy: { createdAt: 'desc' },
            take: 50 // Limit to last 50 themes
        });

        const parsedThemes = themes.map(t => ({
            ...t,
            config: JSON.parse(t.config),
            createdAt: Number(t.createdAt)
        }));

        const response: WebSocketMessage<ThemesListPayload> = {
            type: S2C_MSG_TYPE.THEMES_LIST,
            payload: { themes: parsedThemes }
        };
        ws.send(JSON.stringify(response));
        return true;
    }

    if (message.type === C2S_MSG_TYPE.DELETE_THEME) {
        const payload = message.payload as DeleteThemePayload;
        const theme = await prisma.theme.findUnique({ where: { id: payload.themeId } });

        if (theme && theme.authorId === userId) {
            await prisma.theme.delete({ where: { id: payload.themeId } });
            
            // Broadcast deletion
            const broadcastMsg: WebSocketMessage<ThemeDeletedPayload> = {
                type: S2C_MSG_TYPE.THEME_DELETED,
                payload: { themeId: payload.themeId }
            };
            const msgString = JSON.stringify(broadcastMsg);
            clients.forEach((_, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(msgString);
                }
            });
        }
        return true;
    }

    return false;
}
