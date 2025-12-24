import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@common/types';

export interface VoiceState {
  userId: string;
  channelId: string;
  username?: string;
  avatar?: string;
  isMuted: boolean;
  isDeafened: boolean;
  volume: number; // 0.0 to 1.0
  stream?: MediaStream;
}

interface VoiceSliceState {
  activeVoiceChannelId: string | null;
  voiceStates: Record<string, VoiceState>;
  sharedBrowser: {
      isActive: boolean;
      producerId: string | null;
      url: string | null;
      ownerId: string | null;
  };
  // 1-on-1 Calls
  incomingCall: User | null;
  outgoingCall: User | null;
  isCallConnected: boolean;
}

const initialState: VoiceSliceState = {
  activeVoiceChannelId: null,
  voiceStates: {},
  sharedBrowser: {
      isActive: false,
      producerId: null,
      url: null,
      ownerId: null
  },
  incomingCall: null,
  outgoingCall: null,
  isCallConnected: false
};

const voiceSlice = createSlice({
  name: 'voice',
  initialState,
  reducers: {
    setVoiceChannel: (state, action: PayloadAction<{ channelId: string; members: any[] }>) => {
      state.activeVoiceChannelId = action.payload.channelId;
    },
    clearVoiceChannel: (state) => {
      state.activeVoiceChannelId = null;
      state.voiceStates = {};
    },
    // Compatibility with websocket.ts
    addVoiceChannelMember: (state, action: PayloadAction<{ channelId: string; userId: string; username?: string; avatar?: string }>) => {
        const { userId, channelId, username, avatar } = action.payload;
        if (!state.voiceStates[userId]) {
            state.voiceStates[userId] = {
                userId,
                channelId,
                username: username || '',
                avatar: avatar || '',
                isMuted: false,
                isDeafened: false,
                volume: 0
            };
        }
    },
    removeVoiceChannelMember: (state, action: PayloadAction<{ userId: string }>) => {
        if (state.voiceStates[action.payload.userId]) {
            delete state.voiceStates[action.payload.userId];
        }
    },
    updateVoiceState: (state, action: PayloadAction<{ userId: string; newState: Partial<VoiceState> }>) => {
      const { userId, newState } = action.payload;
      
      if (newState.channelId === null) {
          if (state.voiceStates[userId]) delete state.voiceStates[userId];
          return;
      }

      if (state.voiceStates[userId]) {
        state.voiceStates[userId] = { ...state.voiceStates[userId], ...newState };
      } else if (newState.channelId) {
        state.voiceStates[userId] = {
          userId,
          channelId: newState.channelId,
          username: newState.username || '',
          avatar: newState.avatar || '',
          isMuted: newState.isMuted || false,
          isDeafened: newState.isDeafened || false,
          volume: newState.volume || 0,
          ...newState
        };
      }
    },
    setSharedBrowser: (state, action: PayloadAction<{ isActive: boolean; producerId: string | null; url: string | null; ownerId: string | null }>) => {
      state.sharedBrowser = action.payload;
    },
    setIncomingCall: (state, action: PayloadAction<User | null>) => {
      state.incomingCall = action.payload;
    },
    setOutgoingCall: (state, action: PayloadAction<User | null>) => {
      state.outgoingCall = action.payload;
    },
    setCallConnected: (state, action: PayloadAction<boolean>) => {
      state.isCallConnected = action.payload;
    },
    endCall: (state) => {
      state.incomingCall = null;
      state.outgoingCall = null;
      state.isCallConnected = false;
    }
  },
});

export const { 
    setVoiceChannel, 
    clearVoiceChannel, 
    addVoiceChannelMember,
    removeVoiceChannelMember,
    updateVoiceState,
    setSharedBrowser,
    setIncomingCall,
    setOutgoingCall,
    setCallConnected,
    endCall
} = voiceSlice.actions;

export default voiceSlice.reducer;