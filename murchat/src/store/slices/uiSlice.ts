import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Channel, User } from '../../../common/types'; // NEW Import

interface CallState {
  isIncoming: boolean;
  isRinging: boolean;
  otherUserId: string | null;
  otherUserData: { username: string; avatar?: string | null } | null;
}

interface UiState {
  isSettingsPanelOpen: boolean;
  showMembersSidebar: boolean;
  ping: number; // Latency in ms
  callState: CallState;
  channels: Channel[]; // NEW
  voiceStates: Record<string, { 
    userId: string; 
    channelId: string; 
    username?: string; 
    userAvatar?: string | null;
    volume?: number;
    isMuted?: boolean;
    isDeafened?: boolean;
    isScreenSharing?: boolean;
    isConnecting?: boolean;
    isDisconnected?: boolean;
  }>; // NEW
  inviteModalServerId: string | null; // NEW: Global state for invite modal
  showAccessDenied: boolean; // NEW
}

const initialState: UiState = {
  isSettingsPanelOpen: false,
  showMembersSidebar: true, // Default to true
  ping: 0,
  callState: {
    isIncoming: false,
    isRinging: false,
    otherUserId: null,
    otherUserData: null,
  },
  channels: [], // NEW
  voiceStates: {}, // NEW
  inviteModalServerId: null, // NEW
  showAccessDenied: false, // NEW
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSettingsPanelOpen: (state, action: PayloadAction<boolean>) => {
        state.isSettingsPanelOpen = action.payload;
    },
    setShowAccessDenied: (state, action: PayloadAction<boolean>) => {
        state.showAccessDenied = action.payload;
    },
    toggleMembersSidebar: (state) => {
        state.showMembersSidebar = !state.showMembersSidebar;
    },
    updatePing: (state, action: PayloadAction<number>) => {
        state.ping = action.payload;
    },
    setInviteModalServerId: (state, action: PayloadAction<string | null>) => {
        state.inviteModalServerId = action.payload;
    },
    setIncomingCall: (state, action: PayloadAction<{ callerId: string; callerUsername: string; callerAvatar?: string | null }>) => {
        state.callState.isIncoming = true;
        state.callState.isRinging = true;
        state.callState.otherUserId = action.payload.callerId;
        state.callState.otherUserData = { 
            username: action.payload.callerUsername, 
            avatar: action.payload.callerAvatar 
        };
    },
    resetCallState: (state) => {
        state.callState.isIncoming = false;
        state.callState.isRinging = false;
        state.callState.otherUserId = null;
        state.callState.otherUserData = null;
    },
    // NEW Reducers for channels and voiceStates
    setChannels: (state, action: PayloadAction<Channel[]>) => {
        state.channels = action.payload;
    },
    setVoiceStates: (state, action: PayloadAction<Record<string, { userId: string; channelId: string; username?: string; userAvatar?: string | null }>>) => {
        state.voiceStates = action.payload;
    },
    addVoiceChannelMember: (state, action: PayloadAction<{ userId: string; channelId: string; username?: string; userAvatar?: string | null }>) => {
        const { userId, channelId, username, userAvatar } = action.payload;
        state.voiceStates[userId] = { userId, channelId, username, userAvatar };
    },
    removeVoiceChannelMember: (state, action: PayloadAction<string>) => {
        delete state.voiceStates[action.payload];
    },
    updateVoiceState: (state, action: PayloadAction<{ userId: string; partialState: Partial<UiState['voiceStates'][string]> }>) => {
        const { userId, partialState } = action.payload;
        if (state.voiceStates[userId]) {
            state.voiceStates[userId] = { ...state.voiceStates[userId], ...partialState };
        }
    }
  },
});

export const {
  setSettingsPanelOpen,
  toggleMembersSidebar,
  updatePing,
  setIncomingCall,
  resetCallState,
  setChannels, 
  setVoiceStates,
  setInviteModalServerId,
  setShowAccessDenied,
  addVoiceChannelMember,
  removeVoiceChannelMember,
  updateVoiceState
} = uiSlice.actions;

export default uiSlice.reducer;