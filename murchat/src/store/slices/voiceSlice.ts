import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface VoiceState {
  volume: number;
  localVolume: number; // NEW: Local playback volume (0-200)
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  username?: string;
  avatar?: string; 
  channelId: string;
  isScreenSharing: boolean;
  isVideoEnabled: boolean; // NEW
}

export interface CallState {
  isInCall: boolean;
  isRinging: boolean;
  isIncoming: boolean;
  otherUserId: string | null;
  otherUserData: { username: string; avatar?: string } | null;
}

interface VoiceSliceState {
  activeVoiceChannelId: string | null;
  voiceStates: Record<string, VoiceState>;
  callState: CallState;
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
  callState: {
      isInCall: false,
      isRinging: false,
      isIncoming: false,
      otherUserId: null,
      otherUserData: null
  },
  sharedBrowser: {
      isActive: false,
      producerId: null,
      url: null,
      ownerId: null
  },
};

const createDefaultVoiceState = (channelId: string, username?: string, avatar?: string): VoiceState => ({
    volume: 0,
    localVolume: 100, // Default 100%
    isMuted: false,
    isDeafened: false,
    isConnecting: true, 
    isDisconnected: false,
    username: username,
    avatar: avatar,
    channelId: channelId,
    isScreenSharing: false,
    isVideoEnabled: false, // NEW
});

const voiceSlice = createSlice({
  name: 'voice',
  initialState,
  reducers: {
    setVoiceChannel: (state, action: PayloadAction<{ channelId: string; members: { userId: string; username?: string; avatar?: string }[] }>) => {
        state.activeVoiceChannelId = action.payload.channelId;
        const newVoiceStates: Record<string, VoiceState> = {};
        action.payload.members.forEach(member => {
            newVoiceStates[member.userId] = createDefaultVoiceState(action.payload.channelId, member.username, member.avatar);
        });
        state.voiceStates = newVoiceStates;
    },
    addVoiceChannelMember: (state, action: PayloadAction<{ userId: string; channelId: string; username?: string; avatar?: string; currentUserId: string }>) => {
        const { userId, channelId, username, avatar, currentUserId } = action.payload;
        if (!state.voiceStates[userId]) {
            state.voiceStates[userId] = createDefaultVoiceState(channelId, username, avatar);
        }
        if (currentUserId === userId) {
            state.activeVoiceChannelId = channelId;
        }
    },
    removeVoiceChannelMember: (state, action: PayloadAction<{ userId: string; currentUserId: string }>) => {
        delete state.voiceStates[action.payload.userId];
        if (action.payload.currentUserId === action.payload.userId) {
            state.activeVoiceChannelId = null;
        }
    },
    clearVoiceChannel: (state) => {
        state.activeVoiceChannelId = null;
        state.voiceStates = {};
    },
    updateVoiceState: (state, action: PayloadAction<{ userId: string; newState: Partial<VoiceState> }>) => {
      const { userId, newState } = action.payload;
      if (newState.channelId === null) {
          delete state.voiceStates[userId];
          return;
      }
      
      if (state.voiceStates[userId]) {
        state.voiceStates[userId] = { ...state.voiceStates[userId], ...newState };
      } else {
        // Create new state if it doesn't exist
        state.voiceStates[userId] = {
            userId,
            channelId: newState.channelId || '',
            username: newState.username || '',
            avatar: newState.avatar || '',
            isMuted: newState.isMuted || false,
            isDeafened: newState.isDeafened || false,
            volume: newState.volume || 0,
            ...newState
        };
      }
    },
    setIncomingCall: (state, action: PayloadAction<{ callerId: string; callerData: { username: string; avatar?: string } }>) => {
        state.callState = {
            isInCall: false,
            isRinging: true,
            isIncoming: true,
            otherUserId: action.payload.callerId,
            otherUserData: action.payload.callerData
        };
    },
    setOutgoingCall: (state, action: PayloadAction<{ recipientId: string; recipientData: { username: string; avatar?: string } }>) => {
        state.callState = {
            isInCall: false,
            isRinging: true,
            isIncoming: false,
            otherUserId: action.payload.recipientId,
            otherUserData: action.payload.recipientData
        };
    },
    setCallConnected: (state) => {
        state.callState.isRinging = false;
        state.callState.isInCall = true;
    },
    endCall: (state) => {
        state.callState = {
            isInCall: false,
            isRinging: false,
            isIncoming: false,
            otherUserId: null,
            otherUserData: null
        };
    },
    setSharedBrowser: (state, action: PayloadAction<{ isActive: boolean; producerId: string | null; url: string | null; ownerId: string | null }>) => {
        state.sharedBrowser = action.payload;
    },
  },
});

export const {
    setVoiceChannel,
    addVoiceChannelMember,
    removeVoiceChannelMember,
    clearVoiceChannel,
    updateVoiceState,
    setIncomingCall,
    setOutgoingCall,
    setCallConnected,
    endCall,
    setSharedBrowser
} = voiceSlice.actions;

export default voiceSlice.reducer;
