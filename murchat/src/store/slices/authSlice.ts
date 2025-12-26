import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@common/types';

interface AuthState {
  userId: string | null;
  username: string | null;
  discriminator: string | null;
  email: string | null;
  avatar: string | null;
  status: User['status'];
  bio: string | null;
  profile_banner: string | null;
  profile_theme: string;
  isDeveloper: boolean; // NEW
  isAuthenticated: boolean;
  authError: string | null;
  authVerificationRequired: { email: string; message?: string } | null;
  friends: User[];
  incomingRequests: User[];
  outgoingRequests: User[];
  users: Record<string, User>; // User cache (Full profile data)
  userProfileOpenForId: string | null;
  isStatusMenuOpen: boolean;
}

const initialState: AuthState = {
  userId: null,
  username: null,
  discriminator: null,
  email: null,
  avatar: null,
  status: 'offline',
  bio: null,
  profile_banner: null,
  profile_theme: 'holographic',
  isDeveloper: false,
  isAuthenticated: false,
  authError: null,
  authVerificationRequired: null,
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  users: {},
  userProfileOpenForId: null,
  isStatusMenuOpen: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthSuccess: (state, action: PayloadAction<{ userId: string; username: string; discriminator: string; email: string; avatar?: string; bio?: string; profile_banner?: string; profile_theme?: string; isDeveloper?: boolean; }>) => {
        state.isAuthenticated = true;
        state.userId = action.payload.userId;
        state.username = action.payload.username;
        state.discriminator = action.payload.discriminator;
        state.email = action.payload.email;
        state.avatar = action.payload.avatar || null;
        state.bio = action.payload.bio || null;
        state.profile_banner = action.payload.profile_banner || null;
        state.profile_theme = action.payload.profile_theme || 'holographic';
        state.isDeveloper = action.payload.isDeveloper || false;
        state.authError = null;
        state.status = 'online';
    },
    setAuthError: (state, action: PayloadAction<string>) => {
        state.authError = action.payload;
        state.isAuthenticated = false;
    },
    setAuthVerificationRequired: (state, action: PayloadAction<{ email: string; message?: string } | null>) => {
        state.authVerificationRequired = action.payload;
    },
    logout: (state) => {
        // Reset state on logout
        return initialState;
    },
    updateUserProfile: (state, action: PayloadAction<{ avatar?: string; profile_banner?: string; username?: string; bio?: string; profile_theme?: string; }>) => {
        console.log('[AuthSlice] Updating profile with:', action.payload);
        if (action.payload.avatar !== undefined) state.avatar = action.payload.avatar;
        if (action.payload.profile_banner !== undefined) state.profile_banner = action.payload.profile_banner;
        if (action.payload.username !== undefined) state.username = action.payload.username;
        if (action.payload.bio !== undefined) state.bio = action.payload.bio;
        if (action.payload.profile_theme !== undefined) state.profile_theme = action.payload.profile_theme;
    },
    updateUserStatus: (state, action: PayloadAction<{ userId: string; status: User['status'] }>) => {
        const { userId, status } = action.payload;
        if (state.userId === userId) {
            state.status = status;
        }
        const friend = state.friends.find(f => f.id === userId);
        if (friend) {
            friend.status = status;
        }
    },
    setUserProfileForId: (state, action: PayloadAction<string | null>) => {
        state.userProfileOpenForId = action.payload;
    },
    setUserStatusMenuOpen: (state, action: PayloadAction<boolean>) => {
        state.isStatusMenuOpen = action.payload;
    },
    cacheUser: (state, action: PayloadAction<User>) => {
        state.users[action.payload.id] = {
            ...state.users[action.payload.id],
            ...action.payload
        };
    },
    cacheUsers: (state, action: PayloadAction<User[]>) => {
        action.payload.forEach(user => {
            state.users[user.id] = {
                ...state.users[user.id],
                ...user
            };
        });
    },
    setFriendsList: (state, action: PayloadAction<{ friends: User[], incomingRequests: User[], outgoingRequests: User[] }>) => {
        state.friends = action.payload.friends;
        state.incomingRequests = action.payload.incomingRequests;
        state.outgoingRequests = action.payload.outgoingRequests;
    },
    addFriendRequest: (state, action: PayloadAction<{ user: User, type: 'incoming' | 'outgoing' }>) => {
        if (action.payload.type === 'incoming') {
            if (!state.incomingRequests.find(u => u.id === action.payload.user.id)) {
                state.incomingRequests.push(action.payload.user);
            }
        } else {
            if (!state.outgoingRequests.find(u => u.id === action.payload.user.id)) {
                state.outgoingRequests.push(action.payload.user);
            }
        }
    },
    removeFriendRequest: (state, action: PayloadAction<string>) => {
        state.incomingRequests = state.incomingRequests.filter(u => u.id !== action.payload);
        state.outgoingRequests = state.outgoingRequests.filter(u => u.id !== action.payload);
    },
    addFriend: (state, action: PayloadAction<User>) => {
        if (!state.friends.find(u => u.id === action.payload.id)) {
            state.friends.push(action.payload);
        }
        // Remove from requests if present
        state.incomingRequests = state.incomingRequests.filter(u => u.id !== action.payload.id);
        state.outgoingRequests = state.outgoingRequests.filter(u => u.id !== action.payload.id);
    },
    removeFriend: (state, action: PayloadAction<string>) => {
        state.friends = state.friends.filter(u => u.id !== action.payload);
    },
  },
});

export const {
    setAuthSuccess,
    setAuthError,
    setAuthVerificationRequired,
    logout,
    updateUserProfile,
    updateUserStatus,
    setUserProfileForId,
    setUserStatusMenuOpen,
    cacheUser,
    cacheUsers,
    setFriendsList,
    addFriendRequest,
    removeFriendRequest,
    addFriend,
    removeFriend
} = authSlice.actions;

export default authSlice.reducer;
