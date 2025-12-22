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
    
    // Is it a friend?
    const friend = auth.friends.find(f => f.id === userId);
    if (friend) return { ...friend, roles: [] };
    
    // Is it a server member?
    const serverMember = server.serverMembers.find(m => m.id === userId);
    if (serverMember) return serverMember;

    // Is it in the general user cache?
    const cachedUser = auth.users[userId];
    if (cachedUser) return { id: userId, discriminator: '????', ...cachedUser, roles: [] };

    return null; // User not found
  }
);