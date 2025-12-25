import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ChannelMessage } from '@common/types';
import type { IDmMessage } from '../../services/db';

interface ChatState {
  messages: ChannelMessage[];
  dmMessages: Record<string, IDmMessage[]>;
  activeDmConversationId: string | null;
  dmView: 'dms' | 'friends';
  unreadCounts: Record<string, number>;
  mentionCounts: Record<string, number>;
  typingUsers: Record<string, string[]>;
  pinnedMessagesOpen: boolean;
}

const initialState: ChatState = {
  messages: [],
  dmMessages: {},
  activeDmConversationId: null,
  dmView: 'friends',
  unreadCounts: {},
  mentionCounts: {},
  typingUsers: {},
  pinnedMessagesOpen: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<ChannelMessage>) => {
      const incomingMsg = action.payload;
      
      // 1. Avoid exact ID duplicates
      if (state.messages.find(m => m.id === incomingMsg.id)) return;

      // 2. Fix Duplication: If we receive a real message, remove our local "temp" one
      if (!incomingMsg.id.startsWith('temp-')) {
          const tempIdx = state.messages.findIndex(m => 
              m.id.startsWith('temp-') && 
              m.authorId === incomingMsg.authorId && 
              (m.content === incomingMsg.content || m.audioData === incomingMsg.audioData)
          );
          if (tempIdx !== -1) {
              state.messages.splice(tempIdx, 1);
          }
      }

      state.messages.push(incomingMsg);
    },
    addMessages: (state, action: PayloadAction<ChannelMessage[]>) => {
        action.payload.forEach(msg => {
            if (!state.messages.find(m => m.id === msg.id)) {
                state.messages.push(msg);
            }
        });
    },
    updateMessage: (state, action: PayloadAction<{ messageId: string; content?: string; isPinned?: boolean }>) => {
        const msg = state.messages.find(m => m.id === action.payload.messageId);
        if (msg) {
            if (action.payload.content !== undefined) msg.content = action.payload.content;
            if (action.payload.isPinned !== undefined) (msg as any).isPinned = action.payload.isPinned;
        }
    },
    deleteMessage: (state, action: PayloadAction<string>) => {
        state.messages = state.messages.filter(m => m.id !== action.payload);
    },
    setDmMessages: (state, action: PayloadAction<{ conversationId: string; messages: any[] }>) => {
       const { conversationId, messages } = action.payload;
       state.dmMessages[conversationId] = messages;
    },
    addDmMessage: (state, action: PayloadAction<IDmMessage>) => {
        const { conversationId } = action.payload;
        if (!state.dmMessages[conversationId]) state.dmMessages[conversationId] = [];
        
        // Deduplicate DMs
        if (!state.dmMessages[conversationId].find(m => m.messageId === action.payload.messageId)) {
            state.dmMessages[conversationId].push(action.payload);
        }
    },
    setActiveDmConversationId: (state, action: PayloadAction<string | null>) => {
        state.activeDmConversationId = action.payload;
        if (action.payload !== null) state.dmView = 'dms';
    },
    setDmView: (state, action: PayloadAction<'dms' | 'friends'>) => {
        state.dmView = action.payload;
        if (action.payload === 'friends') state.activeDmConversationId = null;
    },
    setUnreadCounts: (state, action: PayloadAction<{ unreadCounts: Record<string, number>; mentionCounts: Record<string, number> }>) => {
        state.unreadCounts = action.payload.unreadCounts;
        state.mentionCounts = action.payload.mentionCounts;
    },
    incrementUnreadCount: (state, action: PayloadAction<string>) => {
        const channelId = action.payload;
        state.unreadCounts[channelId] = (state.unreadCounts[channelId] || 0) + 1;
    },
    clearUnreadCount: (state, action: PayloadAction<string>) => {
        state.unreadCounts[action.payload] = 0;
    },
    incrementMentionCount: (state, action: PayloadAction<string>) => {
        const channelId = action.payload;
        state.mentionCounts[channelId] = (state.mentionCounts[channelId] || 0) + 1;
    },
    clearMentionCount: (state, action: PayloadAction<string>) => {
        state.mentionCounts[action.payload] = 0;
    },
    setTypingUser: (state, action: PayloadAction<{ channelId: string; username: string; isTyping: boolean }>) => {
        const { channelId, username, isTyping } = action.payload;
        if (!state.typingUsers[channelId]) state.typingUsers[channelId] = [];
        if (isTyping) {
            if (!state.typingUsers[channelId].includes(username)) state.typingUsers[channelId].push(username);
        } else {
            state.typingUsers[channelId] = state.typingUsers[channelId].filter(u => u !== username);
        }
    },
    togglePinnedMessages: (state) => {
        state.pinnedMessagesOpen = !state.pinnedMessagesOpen;
    },
  },
});

export const {
    addMessage, addMessages, updateMessage, deleteMessage,
    setDmMessages, addDmMessage, setActiveDmConversationId, setDmView,
    setUnreadCounts, incrementUnreadCount, clearUnreadCount,
    incrementMentionCount, clearMentionCount, // ADDED THESE
    setTypingUser, togglePinnedMessages
} = chatSlice.actions;

export default chatSlice.reducer;