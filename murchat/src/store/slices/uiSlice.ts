import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Channel } from '../../../common/types';

interface CallState {
  isIncoming: boolean;
  isRinging: boolean;
  isInCall: boolean; // ADDED
  otherUserId: string | null;
  otherUserData: { username: string; avatar?: string | null } | null;
}

interface UiState {
  isSettingsPanelOpen: boolean;
  showMembersSidebar: boolean;
  ping: number; 
  callState: CallState;
  channels: Channel[]; 
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
  }>; 
  inviteModalServerId: string | null;
  showAccessDenied: boolean;
}

const initialState: UiState = {
  isSettingsPanelOpen: false,
  showMembersSidebar: true,
  ping: 0,
  callState: {
    isIncoming: false,
    isRinging: false,
    isInCall: false, // ADDED
    otherUserId: null,
    otherUserData: null,
  },
  channels: [],
  voiceStates: {},
  inviteModalServerId: null,
  showAccessDenied: false,
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
        state.callState.isInCall = false;
        state.callState.otherUserId = action.payload.callerId;
        state.callState.otherUserData = { 
            username: action.payload.callerUsername, 
            avatar: action.payload.callerAvatar 
        };
    },
    setCallConnected: (state, action: PayloadAction<boolean>) => {
        state.callState.isInCall = action.payload;
        state.callState.isRinging = false;
    },
    resetCallState: (state) => {
        state.callState.isIncoming = false;
        state.callState.isRinging = false;
        state.callState.isInCall = false;
        state.callState.otherUserId = null;
        state.callState.otherUserData = null;
    },
    setChannels: (state, action: PayloadAction<Channel[]>) => {
        state.channels = action.payload;
    },
    setVoiceStates: (state, action: PayloadAction<Record<string, any>>) => {
        state.voiceStates = action.payload;
    },
    addVoiceChannelMember: (state, action: PayloadAction<any>) => {
        const { userId } = action.payload;
        state.voiceStates[userId] = action.payload;
    },
    removeVoiceChannelMember: (state, action: PayloadAction<string>) => {
        delete state.voiceStates[action.payload];
    },
    updateVoiceState: (state, action: PayloadAction<{ userId: string; partialState: any }>) => {
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
  setCallConnected,
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
