import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

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
}

const initialState: VoiceSliceState = {
  activeVoiceChannelId: null,
  voiceStates: {},
  sharedBrowser: {
      isActive: false,
      producerId: null,
      url: null,
      ownerId: null
  }
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
    updateVoiceState: (state, action: PayloadAction<{ userId: string; newState: Partial<VoiceState> }>) => {
      const { userId, newState } = action.payload;
      
      // If channelId is explicitly null, remove the user
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
  },
});

export const { 
    setVoiceChannel, 
    clearVoiceChannel, 
    updateVoiceState,
    setSharedBrowser
} = voiceSlice.actions;

export default voiceSlice.reducer;