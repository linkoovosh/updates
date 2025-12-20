import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Server, Channel, ServerMember, Role } from '@common/types';

interface ServerState {
  servers: Server[];
//   channels: Channel[]; // REMOVED
  serverMembers: ServerMember[];
  currentServerRoles: Role[];
  selectedServerId: string | null;
  selectedChannelId: string | null;
  serverSettingsDialog: {
      isOpen: boolean;
      serverId: string | null;
  };
}

const initialState: ServerState = {
  servers: [],
//   channels: [], // REMOVED
  serverMembers: [],
  currentServerRoles: [],
  selectedServerId: null,
  selectedChannelId: null,
  serverSettingsDialog: {
      isOpen: false,
      serverId: null
  },
};

const serverSlice = createSlice({
  name: 'server',
  initialState,
  reducers: {
    setServers: (state, action: PayloadAction<Server[]>) => {
        state.servers = action.payload;
    },
    addServer: (state, action: PayloadAction<Server>) => {
        const exists = state.servers.find(s => s.id === action.payload.id);
        if (!exists) {
            state.servers.push(action.payload);
        }
    },
    removeServer: (state, action: PayloadAction<string>) => {
        state.servers = state.servers.filter(s => s.id !== action.payload);
        if (state.selectedServerId === action.payload) {
            state.selectedServerId = null;
            state.selectedChannelId = null;
        }
    },
    updateServer: (state, action: PayloadAction<Server>) => {
        const index = state.servers.findIndex(s => s.id === action.payload.id);
        if (index !== -1) {
            state.servers[index] = action.payload;
        }
    },
    setSelectedServerId: (state, action: PayloadAction<string | null>) => {
        state.selectedServerId = action.payload;
        // state.selectedChannelId = null; // Removed, let client decide
    },
    // setChannels: (state, action: PayloadAction<Channel[]>) => { // REMOVED
    //     state.channels = action.payload;
    // },
    // addChannel: (state, action: PayloadAction<Channel>) => { // REMOVED
    //     state.channels.push(action.payload);
    // },
    // updateChannel: (state, action: PayloadAction<Channel>) => { // REMOVED
    //     const index = state.channels.findIndex(c => c.id === action.payload.id);
    //     if (index !== -1) {
    //         state.channels[index] = action.payload;
    //     }
    // },
    // removeChannel: (state, action: PayloadAction<string>) => { // REMOVED
    //     state.channels = state.channels.filter(c => c.id !== action.payload);
    //     if (state.selectedChannelId === action.payload) {
    //         state.selectedChannelId = null;
    //     }
    // },
    setSelectedChannelId: (state, action: PayloadAction<string | null>) => {
        state.selectedChannelId = action.payload;
    },
    setServerMembers: (state, action: PayloadAction<ServerMember[]>) => {
        state.serverMembers = action.payload;
    },
    addServerMember: (state, action: PayloadAction<ServerMember>) => {
        const exists = state.serverMembers.find(m => m.id === action.payload.id);
        if (!exists) {
            state.serverMembers.push(action.payload);
        }
    },
    removeServerMember: (state, action: PayloadAction<string>) => {
        state.serverMembers = state.serverMembers.filter(m => m.id !== action.payload);
    },
    updateMemberRoles: (state, action: PayloadAction<{ userId: string; roleIds: string[] }>) => {
        const member = state.serverMembers.find(m => m.id === action.payload.userId);
        if (member) {
            member.roles = action.payload.roleIds;
        }
    },
    updateMemberStatus: (state, action: PayloadAction<{ userId: string; status: string }>) => {
        const member = state.serverMembers.find(m => m.id === action.payload.userId);
        if (member) {
            member.status = action.payload.status;
        }
    },
    updateMemberActivity: (state, action: PayloadAction<{ userId: string; activity: any }>) => {
        const member = state.serverMembers.find(m => m.id === action.payload.userId);
        if (member) {
            member.activity = action.payload.activity;
        }
    },
    setServerRoles: (state, action: PayloadAction<Role[]>) => {
        state.currentServerRoles = action.payload;
    },
    addRole: (state, action: PayloadAction<Role>) => {
        state.currentServerRoles.push(action.payload);
        state.currentServerRoles.sort((a, b) => b.position - a.position);
    },
    updateRole: (state, action: PayloadAction<Role>) => {
        const index = state.currentServerRoles.findIndex(r => r.id === action.payload.id);
        if (index !== -1) {
            state.currentServerRoles[index] = action.payload;
            state.currentServerRoles.sort((a, b) => b.position - a.position);
        }
    },
    deleteRole: (state, action: PayloadAction<string>) => {
        state.currentServerRoles = state.currentServerRoles.filter(r => r.id !== action.payload);
    },
    openServerSettings: (state, action: PayloadAction<string>) => {
        state.serverSettingsDialog = { isOpen: true, serverId: action.payload };
    },
    closeServerSettings: (state) => {
        state.serverSettingsDialog = { isOpen: false, serverId: null };
    },
  },
});

export const {
    setServers,
    addServer,
    removeServer,
    updateServer,
    setSelectedServerId,
    // setChannels, // REMOVED
    // addChannel, // REMOVED
    // updateChannel, // REMOVED
    // removeChannel, // REMOVED
    setSelectedChannelId,
    setServerMembers,
    addServerMember,
    removeServerMember,
    updateMemberRoles,
    updateMemberStatus,
    updateMemberActivity, // NEW
    setServerRoles,
    addRole,
    updateRole,
    deleteRole,
    openServerSettings,
    closeServerSettings
} = serverSlice.actions;

export default serverSlice.reducer;
