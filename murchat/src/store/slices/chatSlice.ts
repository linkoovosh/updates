import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Message } from '@common/types';
import type { IDmMessage } from '../../services/db';

interface ChatState {
  messages: Message[];
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
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
      // Note: Updating unreadCounts usually requires knowing selectedChannelId.
      // If we move selectedChannelId to another slice, we can't easily do it here inside the reducer 
      // without passing selectedChannelId in the payload or handling it in middleware/component.
      // For now, I'll assume the payload might need to carry context or we handle unread logic differently.
      // Actually, let's keep simple addMessage here. Unread logic might need refactoring to be in the event handler or middleware.
    },
    addMessages: (state, action: PayloadAction<Message[]>) => {
        const newMessages = action.payload.filter(newMsg => !state.messages.find(m => m.id === newMsg.id));
        state.messages.push(...newMessages);
    },
    updateMessage: (state, action: PayloadAction<{ messageId: string; content: string }>) => {
        const msg = state.messages.find(m => m.id === action.payload.messageId);
        if (msg) {
            msg.content = action.payload.content;
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
        if (!state.dmMessages[conversationId]) {
            state.dmMessages[conversationId] = [];
        }
        state.dmMessages[conversationId].push(action.payload);
    },
    setActiveDmConversationId: (state, action: PayloadAction<string | null>) => {
        state.activeDmConversationId = action.payload;
        if (action.payload !== null) {
            state.dmView = 'dms';
        }
    },
    setDmView: (state, action: PayloadAction<'dms' | 'friends'>) => {
        state.dmView = action.payload;
        if (action.payload === 'friends') {
            state.activeDmConversationId = null;
        }
    },
    setUnreadCounts: (state, action: PayloadAction<{ unreadCounts: Record<string, number>; mentionCounts: Record<string, number> }>) => {
        state.unreadCounts = action.payload.unreadCounts;
        state.mentionCounts = action.payload.mentionCounts;
    },
    // We need a way to increment unread count.
    incrementUnreadCount: (state, action: PayloadAction<string>) => {
        const channelId = action.payload;
        state.unreadCounts[channelId] = (state.unreadCounts[channelId] || 0) + 1;
    },
    clearUnreadCount: (state, action: PayloadAction<string>) => {
        state.unreadCounts[action.payload] = 0;
    },
    setTypingUser: (state, action: PayloadAction<{ channelId: string; username: string; isTyping: boolean }>) => {
        const { channelId, username, isTyping } = action.payload;
        if (!state.typingUsers[channelId]) state.typingUsers[channelId] = [];
        
        if (isTyping) {
            if (!state.typingUsers[channelId].includes(username)) {
                state.typingUsers[channelId].push(username);
            }
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
    addMessage,
    addMessages,
    updateMessage,
    deleteMessage,
    setDmMessages,
    addDmMessage,
    setActiveDmConversationId,
    setDmView,
    setUnreadCounts,
    incrementUnreadCount,
    clearUnreadCount,
    setTypingUser,
    togglePinnedMessages
} = chatSlice.actions;

export default chatSlice.reducer;
