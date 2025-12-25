import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ChannelMessage, DirectMessage } from '../../murchat/common/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_ROOT = path.join(process.cwd(), 'db_messages');

if (!fs.existsSync(DB_ROOT)) {
    fs.mkdirSync(DB_ROOT, { recursive: true });
}

class StorageService {
    private connections: Map<string, Database> = new Map();

    private async getDb(serverId: string | 'dms'): Promise<Database> {
        const dbName = serverId === 'dms' ? 'dms.sqlite' : `server_${serverId}.sqlite`;
        const dbPath = path.join(DB_ROOT, dbName);

        if (this.connections.has(serverId)) {
            return this.connections.get(serverId)!;
        }

        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Initialize schema
        if (serverId === 'dms') {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS direct_messages (
                    id TEXT PRIMARY KEY,
                    senderId TEXT,
                    recipientId TEXT,
                    content TEXT,
                    timestamp INTEGER,
                    read INTEGER DEFAULT 0,
                    attachments TEXT
                )
            `);
        } else {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    channelId TEXT,
                    authorId TEXT,
                    authorName TEXT,
                    authorAvatar TEXT,
                    content TEXT,
                    timestamp INTEGER,
                    audioData TEXT,
                    attachments TEXT,
                    replyToId TEXT,
                    isPinned INTEGER DEFAULT 0
                )
            `);
            // Add isPinned if it doesn't exist (for existing DBs)
            try { await db.exec(`ALTER TABLE messages ADD COLUMN isPinned INTEGER DEFAULT 0`); } catch (e) {}
            
            // Create index for fast history fetching
            await db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_ts ON messages(channelId, timestamp)`);
        }

        this.connections.set(serverId, db);
        return db;
    }

    // --- Channel Messages ---

    async saveChannelMessage(serverId: string, msg: ChannelMessage) {
        const db = await this.getDb(serverId);
        await db.run(
            `INSERT INTO messages (id, channelId, authorId, authorName, authorAvatar, content, timestamp, audioData, attachments, replyToId) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                msg.id, 
                msg.channelId, 
                msg.authorId, 
                msg.author, 
                msg.authorAvatar, 
                msg.content, 
                msg.timestamp, 
                msg.audioData || null, 
                JSON.stringify(msg.attachments || []),
                msg.replyToId || null
            ]
        );
    }

    async getChannelMessages(serverId: string, channelId: string, limit: number = 50, beforeTimestamp: number): Promise<ChannelMessage[]> {
        const db = await this.getDb(serverId);
        const rows = await db.all(
            `SELECT * FROM messages WHERE channelId = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?`,
            [channelId, beforeTimestamp, limit]
        );

        return rows.reverse().map(row => ({
            id: row.id,
            channelId: row.channelId,
            authorId: row.authorId,
            author: row.authorName,
            authorAvatar: row.authorAvatar,
            content: row.content,
            timestamp: row.timestamp,
            audioData: row.audioData,
            attachments: JSON.parse(row.attachments || '[]'),
            replyToId: row.replyToId,
            isPinned: !!row.isPinned
        }));
    }

    async pinChannelMessage(serverId: string, messageId: string) {
        const db = await this.getDb(serverId);
        await db.run(`UPDATE messages SET isPinned = 1 WHERE id = ?`, [messageId]);
    }

    async unpinChannelMessage(serverId: string, messageId: string) {
        const db = await this.getDb(serverId);
        await db.run(`UPDATE messages SET isPinned = 0 WHERE id = ?`, [messageId]);
    }

    async deleteChannelMessage(serverId: string, messageId: string) {
        const db = await this.getDb(serverId);
        await db.run(`DELETE FROM messages WHERE id = ?`, [messageId]);
    }

    async updateChannelMessage(serverId: string, messageId: string, content: string) {
        const db = await this.getDb(serverId);
        await db.run(`UPDATE messages SET content = ? WHERE id = ?`, [content, messageId]);
    }

    // --- Direct Messages ---

    async saveDirectMessage(msg: DirectMessage) {
        const db = await this.getDb('dms');
        await db.run(
            `INSERT INTO direct_messages (id, senderId, recipientId, content, timestamp, read, attachments) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [msg.id, msg.senderId, msg.recipientId, msg.content, msg.timestamp, msg.read, JSON.stringify(msg.attachments || [])]
        );
    }

    async getDmHistory(userId1: string, userId2: string, limit: number = 50): Promise<DirectMessage[]> {
        const db = await this.getDb('dms');
        const rows = await db.all(
            `SELECT * FROM direct_messages 
             WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
             ORDER BY timestamp DESC LIMIT ?`,
            [userId1, userId2, userId2, userId1, limit]
        );

        return rows.reverse().map(row => ({
            id: row.id,
            senderId: row.senderId,
            recipientId: row.recipientId,
            content: row.content,
            timestamp: row.timestamp,
            read: row.read,
            attachments: JSON.parse(row.attachments || '[]')
        }));
    }
}

export const storageService = new StorageService();
