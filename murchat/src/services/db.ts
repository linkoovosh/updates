import Dexie, { type Table } from 'dexie';

export interface IDmMessage {
  id?: number; // Primary key. Optional since it's auto-incrementing
  messageId: string; // A unique ID for the message itself, e.g., UUID
  conversationId: string; // A consistent ID for the chat between two users
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: number;
  isSent: boolean; // To track if the message has been sent to the server
}

export class MySubClassedDexie extends Dexie {
  dmMessages!: Table<IDmMessage>; 

  constructor() {
    super('murChatDb_v2');
    this.version(1).stores({
      dmMessages: '++id, messageId, conversationId, timestamp' // Primary key and indexes
    });
  }
}

export const db = new MySubClassedDexie();

/**
 * Creates a consistent conversation ID for any two user IDs.
 * @param userId1 The ID of the first user.
 * @param userId2 The ID of the second user.
 * @returns A sorted and concatenated string to be used as a conversation ID.
 */
export const getConversationId = (userId1: string, userId2: string): string => {
  return [userId1, userId2].sort().join(':');
};
