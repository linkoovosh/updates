import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '..';

const selectAuth = (state: RootState) => state.auth;
const selectServer = (state: RootState) => state.server;

export const makeSelectTargetUser = () => createSelector(
  [
    selectAuth,
    selectServer,
    (state: RootState, userId: string) => userId,
  ],
  (auth, server, userId) => {
    // Is it the logged-in user?
    if (userId === auth.userId) {
      return {
        id: auth.userId,
        username: auth.username,
        discriminator: auth.discriminator,
        avatar: auth.avatar,
        status: auth.status,
        bio: auth.bio,
        profile_banner: auth.profile_banner,
        profile_theme: auth.profile_theme
      };
    }
    
    // 3. Is it a server member? (Usually has full data from S2C_SERVER_MEMBERS)
    const serverMember = server.serverMembers.find(m => m.id === userId);
    
    // 4. Is it in the general user cache?
    const cachedUser = auth.users[userId];

    // Priority: Server Member (most current) > Friend > General Cache
    if (serverMember) return serverMember;
    if (friend) return { ...friend, roles: [] };
    if (cachedUser) return { ...cachedUser, roles: [] };

    return null; // User not found
  }
);