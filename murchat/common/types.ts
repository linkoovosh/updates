// Shared Data Structures
export interface Attachment {
    id: string;
    url: string;
    filename: string;
    contentType: string;
    size: number;
}

export interface UserActivity { // NEW
    type: 'playing' | 'listening' | 'watching';
    name: string; // "Dota 2"
    details?: string; // "Ranked Match"
    startedAt: number; // Timestamp
    icon?: string | null; // Base64 icon
}

export interface ChannelMessage { // Renamed from Message
  id: string;
  channelId: string;
  author: string;
  authorId: string;
  authorAvatar?: string | null;
  timestamp: number;
  content: string;
  audioData?: string; // Base64 encoded audio
  attachments?: Attachment[];
  replyToId?: string; // Optional reply reference
}

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string; // Hex color code
  position: number;
  permissions?: string | null; // Bitmask (TEXT in DB)
}

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  description?: string | null;
  banner?: string | null;
  systemChannelId?: string | null;
  verificationLevel?: number; // 0: None, 1: Email required, 2: 10min on server
  isPublic?: boolean;
  avatar_default?: string | null;
  avatar_active?: string | null;
  createdAt?: bigint | null; // Prisma returns BigInt or can be null
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: string; // Prisma returns string ('text' | 'voice' | 'forum')
  position?: number;
  isPrivate?: boolean;
}

export interface Invite {
  id: string;
  code: string;
  serverId: string;
  channelId: string | null;
  authorId: string;
  maxUses: number | null;
  uses: number;
  expiresAt?: bigint | null; // Unix timestamp
  defaultRoleId: string | null;
  temporary: boolean | number; // SQLite uses INTEGER for BOOLEAN
  createdAt?: bigint | null; // Unix timestamp
}

export interface User {
  id: string;
  username: string;
  discriminator: string; // The 4-digit tag (e.g. "1234")
  email: string;
  avatar?: string | null; // Base64 data or URL
  status?: string;
  bio?: string;
  profile_banner?: string;
  profile_theme?: string; // NEW: holographic, glass, cyberpunk, etc.
  activity?: UserActivity | null; // NEW: Current activity
  isDeveloper?: boolean; // NEW: Is this user a developer?
}

export interface ServerMember extends User {
    roles: string[]; // Array of Role IDs
    joinedAt?: bigint | null; // Prisma BigInt
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ThemeConfig {
    cardBg: string;
    cardBorder: string;
    cardShadow: string;
    cardBlur: number; // px
    textColor: string;
    accentColor: string;
    avatarBorder: string;
    avatarGlow: string;
    // New fields for enhanced customization
    borderRadius?: string; // e.g. "24px"
    bgImage?: string; // URL
    backdropSaturate?: number; // % (default 100 or 160)
    shineOpacity?: number; // 0.0 to 1.0
    animations?: boolean;
}

export interface CustomTheme {
    id: string;
    name: string;
    authorId: string;
    authorName: string;
    config: ThemeConfig;
    isPublic: boolean;
    createdAt?: number;
}

// Client-to-Server message types
export const C2S_MSG_TYPE = {
  CREATE_THEME: 'C2S_CREATE_THEME',
  UPDATE_THEME: 'C2S_UPDATE_THEME', // NEW
  GET_THEMES: 'C2S_GET_THEMES',
  DELETE_THEME: 'C2S_DELETE_THEME',
  REGISTER: 'C2S_REGISTER',
  LOGIN: 'C2S_LOGIN',
  LOGIN_WITH_TOKEN: 'C2S_LOGIN_WITH_TOKEN',
  UPDATE_PROFILE: 'C2S_UPDATE_PROFILE',
  UPDATE_STATUS: 'C2S_UPDATE_STATUS',
  UPDATE_ACTIVITY: 'C2S_UPDATE_ACTIVITY', // NEW
  SEND_MESSAGE: 'C2S_SEND_MESSAGE',
  CREATE_SERVER: 'C2S_CREATE_SERVER',
  UPDATE_SERVER: 'C2S_UPDATE_SERVER',
  UPDATE_SERVER_PROFILE: 'C2S_UPDATE_SERVER_PROFILE',
  DELETE_SERVER: 'C2S_DELETE_SERVER',
  CREATE_CHANNEL: 'C2S_CREATE_CHANNEL',
  UPDATE_CHANNEL: 'C2S_UPDATE_CHANNEL', // NEW
  DELETE_CHANNEL: 'C2S_DELETE_CHANNEL', // NEW
  
  // Roles & Permissions
  CREATE_ROLE: 'C2S_CREATE_ROLE',
  UPDATE_ROLE: 'C2S_UPDATE_ROLE',
  DELETE_ROLE: 'C2S_DELETE_ROLE',
  UPDATE_MEMBER_ROLES: 'C2S_UPDATE_MEMBER_ROLES',
  
  KICK_MEMBER: 'C2S_KICK_MEMBER', // NEW
  BAN_MEMBER: 'C2S_BAN_MEMBER',   // NEW
  UNBAN_MEMBER: 'C2S_UNBAN_MEMBER', // NEW

  ADD_FRIEND: 'C2S_ADD_FRIEND',
  ACCEPT_FRIEND_REQUEST: 'C2S_ACCEPT_FRIEND_REQUEST',
  REJECT_FRIEND_REQUEST: 'C2S_REJECT_FRIEND_REQUEST',
  REMOVE_FRIEND: 'C2S_REMOVE_FRIEND',
  GET_FRIENDS: 'C2S_GET_FRIENDS',
  CREATE_INVITE: 'C2S_CREATE_INVITE',
  GET_INVITES: 'C2S_GET_INVITES',
  DELETE_INVITE: 'C2S_DELETE_INVITE',
  C2S_WEBRTC_JOIN_VOICE_CHANNEL: 'C2S_WEBRTC_JOIN_VOICE_CHANNEL',
  C2S_WEBRTC_LEAVE_VOICE_CHANNEL: 'C2S_WEBRTC_LEAVE_VOICE_CHANNEL',
  C2S_WEBRTC_OFFER: 'C2S_WEBRTC_OFFER',
  C2S_WEBRTC_ANSWER: 'C2S_WEBRTC_ANSWER',
  C2S_WEBRTC_ICE_CANDIDATE: 'C2S_WEBRTC_ICE_CANDIDATE',
  // Mediasoup Signaling (SFU)
  MS_GET_ROUTER_RTP_CAPABILITIES: 'MS_GET_ROUTER_RTP_CAPABILITIES',
  MS_CREATE_WEBRTC_TRANSPORT: 'MS_CREATE_WEBRTC_TRANSPORT',
  MS_CONNECT_TRANSPORT: 'MS_CONNECT_TRANSPORT',
  MS_PRODUCE: 'MS_PRODUCE',
  MS_CONSUME: 'MS_CONSUME',
  MS_RESUME_CONSUMER: 'MS_RESUME_CONSUMER', // NEW
  MS_PAUSE_CONSUMER: 'MS_PAUSE_CONSUMER',   // NEW
  MS_CLOSE_PRODUCER: 'MS_CLOSE_PRODUCER',
  MS_GET_EXISTING_PRODUCERS: 'MS_GET_EXISTING_PRODUCERS',
  
  // Generic
  LEAVE_SERVER: 'C2S_LEAVE_SERVER',
  INVITE_FRIENDS_TO_SERVER: 'C2S_INVITE_FRIENDS_TO_SERVER',
  SET_SELECTED_SERVER: 'C2S_SET_SELECTED_SERVER',
  GET_SERVER_MEMBERS: 'C2S_GET_SERVER_MEMBERS',
  SEND_DM: 'C2S_SEND_DM',
  GET_DM_HISTORY: 'C2S_GET_DM_HISTORY',
  GET_CHANNEL_MESSAGES: 'C2S_GET_CHANNEL_MESSAGES', // NEW
  MARK_CHANNEL_READ: 'C2S_MARK_CHANNEL_READ', // NEW

  EDIT_MESSAGE: 'C2S_EDIT_MESSAGE',
  DELETE_MESSAGE: 'C2S_DELETE_MESSAGE',
  PIN_MESSAGE: 'C2S_PIN_MESSAGE', // NEW
  UNPIN_MESSAGE: 'C2S_UNPIN_MESSAGE', // NEW
  
  CHANGE_PASSWORD: 'C2S_CHANGE_PASSWORD',
  VERIFY_EMAIL: 'C2S_VERIFY_EMAIL',
  RESEND_VERIFICATION_CODE: 'C2S_RESEND_VERIFICATION_CODE',
  
  // System
  PING: 'C2S_PING',

  // 1-on-1 Voice Call Signaling
  CALL_REQUEST: 'C2S_CALL_REQUEST',
  CALL_RESPONSE: 'C2S_CALL_RESPONSE', // Accept or Reject
  CALL_HANGUP: 'C2S_CALL_HANGUP',

  // Shared Browser
  START_SHARED_BROWSER: 'C2S_START_SHARED_BROWSER',
  STOP_SHARED_BROWSER: 'C2S_STOP_SHARED_BROWSER',
  SHARED_BROWSER_INPUT: 'C2S_SHARED_BROWSER_INPUT',

  // Typing
  TYPING_START: 'C2S_TYPING_START',
  TYPING_STOP: 'C2S_TYPING_STOP',
} as const;

export type C2S_MSG_TYPE = typeof C2S_MSG_TYPE[keyof typeof C2S_MSG_TYPE];

// Server-to-Client message types
export const S2C_MSG_TYPE = {
  THEME_CREATED: 'S2C_THEME_CREATED',
  THEME_UPDATED: 'S2C_THEME_UPDATED', // NEW
  THEME_DELETED: 'S2C_THEME_DELETED',
  THEMES_LIST: 'S2C_THEMES_LIST',
  AUTH_SUCCESS: 'S2C_AUTH_SUCCESS',
  AUTH_ERROR: 'S2C_AUTH_ERROR',
  USER_UPDATED: 'S2C_USER_UPDATED',
  PRESENCE_UPDATE: 'S2C_PRESENCE_UPDATE',
  ACTIVITY_UPDATE: 'S2C_ACTIVITY_UPDATE', // NEW
  NEW_MESSAGE: 'S2C_NEW_MESSAGE',
  MESSAGE_UPDATED: 'S2C_MESSAGE_UPDATED',
  MESSAGE_DELETED: 'S2C_MESSAGE_DELETED',
  MESSAGE_PINNED: 'S2C_MESSAGE_PINNED', // NEW
  MESSAGE_UNPINNED: 'S2C_MESSAGE_UNPINNED', // NEW
  RECEIVE_DM: 'S2C_RECEIVE_DM',
  DM_HISTORY: 'S2C_DM_HISTORY',
  CHANNEL_MESSAGES: 'S2C_CHANNEL_MESSAGES', // NEW
  UNREAD_COUNTS: 'S2C_UNREAD_COUNTS', // NEW
  FRIEND_REQUEST_SENT: 'S2C_FRIEND_REQUEST_SENT',
  FRIEND_REQUEST_RECEIVED: 'S2C_FRIEND_REQUEST_RECEIVED',
  FRIEND_REQUEST_ACCEPTED: 'S2C_FRIEND_REQUEST_ACCEPTED',
  FRIEND_REQUEST_REJECTED: 'S2C_FRIEND_REQUEST_REJECTED',
  FRIEND_REMOVED: 'S2C_FRIEND_REMOVED',
  FRIENDS_LIST: 'S2C_FRIENDS_LIST',
  FRIEND_ADDED: 'S2C_FRIEND_ADDED',
  INITIAL_STATE: 'S2C_INITIAL_STATE',
  SERVER_CREATED: 'S2C_SERVER_CREATED',
  SERVER_UPDATED: 'S2C_SERVER_UPDATED',
  SERVER_DELETED: 'S2C_SERVER_DELETED',
  CHANNEL_CREATED: 'S2C_CHANNEL_CREATED',
  CHANNEL_UPDATED: 'S2C_CHANNEL_UPDATED', // NEW
  CHANNEL_DELETED: 'S2C_CHANNEL_DELETED', // NEW
  S2C_INVITES_LIST: 'S2C_INVITES_LIST',
  S2C_INVITE_CREATED: 'S2C_INVITE_CREATED',
  S2C_SERVER_MEMBERS: 'S2C_SERVER_MEMBERS', // NEW
  S2C_SERVER_ROLES: 'S2C_SERVER_ROLES', // NEW
  S2C_ROLE_CREATED: 'S2C_ROLE_CREATED',
  S2C_ROLE_UPDATED: 'S2C_ROLE_UPDATED',
  S2C_ROLE_DELETED: 'S2C_ROLE_DELETED',
  S2C_MEMBER_ROLES_UPDATED: 'S2C_MEMBER_ROLES_UPDATED',
  
  S2C_SERVER_MEMBER_ADDED: 'S2C_SERVER_MEMBER_ADDED',     // NEW
  S2C_SERVER_MEMBER_REMOVED: 'S2C_SERVER_MEMBER_REMOVED', // NEW
  
  S2C_WEBRTC_USER_JOINED_VOICE_CHANNEL: 'S2C_WEBRTC_USER_JOINED_VOICE_CHANNEL',
  S2C_WEBRTC_USER_LEFT_VOICE_CHANNEL: 'S2C_WEBRTC_USER_LEFT_VOICE_CHANNEL',
  S2C_WEBRTC_EXISTING_VOICE_MEMBERS: 'S2C_WEBRTC_EXISTING_VOICE_MEMBERS',
  S2C_WEBRTC_OFFER: 'S2C_WEBRTC_OFFER',
  S2C_WEBRTC_ANSWER: 'S2C_WEBRTC_ANSWER',
  S2C_WEBRTC_ICE_CANDIDATE: 'S2C_WEBRTC_ICE_CANDIDATE',
  S2C_VOICE_STATE_UPDATE: 'S2C_VOICE_STATE_UPDATE',
  
  PONG: 'S2C_PONG',

  PASSWORD_CHANGED: 'S2C_PASSWORD_CHANGED',
  VERIFICATION_REQUIRED: 'S2C_VERIFICATION_REQUIRED',
  VERIFICATION_CODE_SENT: 'S2C_VERIFICATION_CODE_SENT',

  // Mediasoup S2C
  MS_ROUTER_RTP_CAPABILITIES: 'MS_ROUTER_RTP_CAPABILITIES',
  MS_WEBRTC_TRANSPORT_CREATED: 'MS_WEBRTC_TRANSPORT_CREATED',
  MS_TRANSPORT_CONNECTED: 'MS_TRANSPORT_CONNECTED', // NEW
  MS_PRODUCER_CREATED: 'MS_PRODUCER_CREATED',
  MS_CONSUMER_CREATED: 'MS_CONSUMER_CREATED',
  MS_NEW_PEER_PRODUCER: 'MS_NEW_PEER_PRODUCER', // Notify others about new producer
  MS_PRODUCER_CLOSED: 'S2C_MS_PRODUCER_CLOSED', // Notify others that a producer closed

  // 1-on-1 Voice Call Signaling
  INCOMING_CALL: 'S2C_INCOMING_CALL',
  CALL_RESPONSE: 'S2C_CALL_RESPONSE', // Client receives "Accepted" or "Rejected"
  CALL_ENDED: 'S2C_CALL_ENDED',

  // Shared Browser
  SHARED_BROWSER_STARTED: 'S2C_SHARED_BROWSER_STARTED',
  SHARED_BROWSER_STOPPED: 'S2C_SHARED_BROWSER_STOPPED',

  // Typing
  USER_TYPING: 'S2C_USER_TYPING',

  // DevTools Access
  DEV_ACCESS_GRANTED: 'S2C_DEV_ACCESS_GRANTED',
  DEV_ACCESS_REVOKED: 'S2C_DEV_ACCESS_REVOKED',
} as const;

export type S2C_MSG_TYPE = typeof S2C_MSG_TYPE[keyof typeof S2C_MSG_TYPE];

// Generic WebSocket message structure
export interface WebSocketMessage<T> {
  type: C2S_MSG_TYPE | S2C_MSG_TYPE;
  payload: T;
}

// Type definitions for C2S payloads
export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginWithTokenPayload {
  token: string;
}

export interface UpdateProfilePayload {
  avatar?: string;
  username?: string;
  bio?: string;
  profile_banner?: string;
  profile_theme?: string;
}

export interface UpdateStatusPayload {
    status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface UpdateActivityPayload { // NEW
    activity: UserActivity | null;
}

export interface ActivityUpdatePayload { // NEW (S2C)
    userId: string;
    activity: UserActivity | null;
}

export interface UpdateServerProfilePayload {
  serverId: string;
  avatar_default?: string; // Base64 encoded image
  avatar_active?: string; // Base64 encoded image
}

export interface AddFriendPayload {
  username: string;
  discriminator: string;
}

export interface AcceptFriendRequestPayload {
  userId: string; // ID of the user whose request we are accepting
}

export interface RejectFriendRequestPayload {
  userId: string;
}

export interface RemoveFriendPayload {
  friendId: string;
}

export interface SendMessagePayload {
  channelId: string;
  content: string; // Can be empty if audioData is present
  author: string;
  audioData?: string; // Optional audio
  attachments?: Attachment[];
  replyToId?: string; // Optional reply reference
}

export interface EditMessagePayload {
  messageId: string;
  channelId: string;
  content: string;
}

export interface DeleteMessagePayload {
  messageId: string;
  channelId: string;
}

export interface MessageUpdatedPayload {
    messageId: string;
    channelId: string;
    content: string;
    isEdited: boolean;
}

export interface MessageDeletedPayload {
    messageId: string;
    channelId: string;
}

export interface SendDmPayload {
    messageId: string;
    recipientId: string;
    content: string;
    timestamp: number;
    attachments?: Attachment[];
}

export interface CreateServerPayload {
  name: string;
  ownerId: string;
  isPublic?: boolean;
}

export interface UpdateServerPayload {
  serverId: string;
  name?: string;
  description?: string;
  banner?: string;
  systemChannelId?: string | null;
  verificationLevel?: number;
  isPublic?: boolean;
}

export interface DeleteServerPayload {
  serverId: string;
}

export interface CreateChannelPayload {
  serverId: string;
  name: string;
  type: 'text' | 'voice' | 'forum';
  isPrivate?: boolean;
}

export interface CreateInvitePayload {
  serverId: string;
  channelId?: string;
  maxUses?: number | null;
  expiresAt?: number | null; // In seconds from now
  temporary?: boolean;
  defaultRoleId?: string;
}

export interface GetInvitesPayload {
  serverId: string;
}

export interface DeleteInvitePayload {
  code: string;
}

export interface WebRtcJoinVoiceChannelPayload {
  channelId: string;
  userId: string;
  username: string;
  userAvatar?: string;
}

export interface WebRtcLeaveVoiceChannelPayload {
  channelId: string;
  userId: string;
}

export interface WebRtcOfferPayload {
  targetUserId: string;
  senderUserId: string;
  username: string;
  userAvatar?: string;
  offer: RTCSessionDescriptionInit;
}

export interface WebRtcAnswerPayload {
  targetUserId: string;
  senderUserId: string;
  answer: RTCSessionDescriptionInit;
}

export interface WebRtcIceCandidatePayload {
  targetUserId: string;
  senderUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface SetSelectedServerPayload {
  selectedServerId: string | null;
}

export interface LeaveServerPayload {
  serverId: string;
}

export interface InviteFriendsToServerPayload {
  serverId: string;
  friendIds: string[];
}

export interface CallRequestPayload {
  recipientId: string;
}

export interface CallResponsePayload {
  callerId: string;
  accepted: boolean;
}

export interface CallHangupPayload {
  recipientId: string;
}

export interface GetDmHistoryPayload {
  recipientId: string;
  limit?: number;
  beforeId?: string;
}

export interface GetChannelMessagesPayload {
    channelId: string;
    limit?: number;
    beforeTimestamp?: number;
}

export interface MarkChannelReadPayload {
    channelId: string;
}

export interface ChannelMessagesPayload {
    channelId: string;
    messages: ChannelMessage[]; // Changed from Message to ChannelMessage
}

export interface UnreadCountsPayload {
    unreadCounts: Record<string, number>; // channelId -> count
    mentionCounts: Record<string, number>; // channelId -> count
}

// Type definitions for S2C payloads
export interface AuthSuccessPayload {
  userId: string;
  username: string;
  discriminator: string;
  email: string;
  token: string | null;
  avatar?: string | null;
  bio?: string | null;
  profile_banner?: string | null;
  profile_theme?: string | null;
  isDeveloper?: boolean;
}

export interface AuthErrorPayload {
  error: string;
}

export interface ReceiveDmPayload {
    messageId: string;
    senderId: string;
    content: string;
    timestamp: number;
    attachments?: Attachment[];
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: number;
  read: number;
  attachments?: Attachment[];
  audioData?: string; // ADDED THIS
}

export interface SendDmPayload {
    messageId: string;
    recipientId: string;
    content: string;
    timestamp: number;
    attachments?: Attachment[];
    audioData?: string; // ADDED THIS
}

export interface ReceiveDmPayload {
    messageId: string;
    senderId: string;
    content: string;
    timestamp: number;
    attachments?: Attachment[];
    audioData?: string; // ADDED THIS
}

export interface DmHistoryPayload {
  recipientId: string;
  messages: DirectMessage[]; // Changed from DmMessage to DirectMessage
}

export interface PresenceUpdatePayload {
    userId: string;
    status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface FriendRequestSentPayload {
  toUserId: string;
}

export interface FriendRequestReceivedPayload {
  fromUser: User;
}

export interface FriendRequestAcceptedPayload {
  user: User; // The user who is now your friend
}

export interface FriendRequestRejectedPayload {
  userId: string;
}

export interface FriendRemovedPayload {
  friendId: string;
}

export interface FriendsListPayload {
  friends: User[];
  incomingRequests: User[];
  outgoingRequests: User[];
}

export interface UserUpdatedPayload {
  userId: string;
  user: User;
}

export interface NewMessagePayload { // Renamed from NewMessagePayload, will be used as response
  message: ChannelMessage;
}

export interface InitialStatePayload {
  servers: Server[];
  channels: Channel[];
  voiceStates: { userId: string; channelId: string; username?: string; userAvatar?: string | null }[]; // NEW
}

export interface VoiceStateUpdatePayload {
    userId: string;
    channelId: string | null; // null if left
    username?: string;
    userAvatar?: string | null;
}

export interface ServerCreatedPayload {
  server: Server;
}

export interface ServerUpdatedPayload {
  server: Server;
}

export interface ServerDeletedPayload {
  serverId: string;
}

export interface InviteCreatedPayload {
  invite: Invite;
}

export interface InvitesListPayload {
  invites: Invite[];
}

export interface ServerMembersPayload {
    serverId: string;
    members: ServerMember[];
}

export interface ServerRolesPayload {
    serverId: string;
    roles: Role[];
}

export interface CreateRolePayload {
    serverId: string;
    name: string;
    color?: string;
}

export interface UpdateRolePayload {
    serverId: string;
    roleId: string;
    name?: string;
    color?: string;
    permissions?: number;
    position?: number;
}

export interface DeleteRolePayload {
    serverId: string;
    roleId: string;
}

export interface UpdateMemberRolesPayload {
    serverId: string;
    userId: string;
    roleIds: string[]; // New set of roles
}

export interface RoleCreatedPayload {
    role: Role;
}

export interface RoleUpdatedPayload {
    role: Role;
}

export interface RoleDeletedPayload {
    roleId: string;
    serverId: string;
}

export interface MemberRolesUpdatedPayload {
    serverId: string;
    userId: string;
    roleIds: string[];
}

export interface ChannelCreatedPayload {
  channel: Channel;
}

export interface UpdateChannelPayload {
    channelId: string;
    name?: string;
    isPrivate?: boolean;
}

export interface DeleteChannelPayload {
    channelId: string;
}

export interface ChannelUpdatedPayload {
    channel: Channel;
}

export interface ChannelDeletedPayload {
    channelId: string;
}

export interface WebRtcUserJoinedVoiceChannelPayload {
  channelId: string;
  userId: string;
  username: string;
  userAvatar?: string | null;
}

export interface WebRtcUserLeftVoiceChannelPayload {
  channelId: string;
  userId: string;
}

export interface WebRtcExistingMembersPayload {
  channelId: string;
  members: { userId: string; username: string; userAvatar?: string | null }[];
}

export interface WebRtcOfferPayloadS2C {
  senderUserId: string;
  username: string;
  userAvatar?: string | null;
  offer: RTCSessionDescriptionInit;
}

export interface WebRtcAnswerPayloadS2C {
  senderUserId: string;
  answer: RTCSessionDescriptionInit;
}

export interface WebRtcIceCandidatePayloadS2C {
  senderUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface IncomingCallPayload {
  caller: User;
}

export interface S2CCallResponsePayload {
  responderId: string;
  accepted: boolean;
}

export interface CallEndedPayload {

  reason?: string;

}

export interface DmHistoryResponsePayload { // NEW TYPE FOR RESPONSE
  recipientId: string;
  messages: DirectMessage[];
}



export interface ChangePasswordPayload {

    oldPassword?: string; // Optional if resetting via email (future feature), but required for now

    newPassword: string;

}



export interface VerifyEmailPayload {

    email: string;

    code: string;

}



export interface ResendVerificationCodePayload {

    email: string;

    message?: string;

}



export interface VerificationRequiredPayload {

    email: string;

    message?: string;

}

export interface StartSharedBrowserPayload {
    channelId: string;
    url?: string;
}

export interface StopSharedBrowserPayload {
    channelId: string;
}

export interface SharedBrowserInputPayload {
    channelId: string;
    inputType: 'mousemove' | 'click' | 'mousedown' | 'mouseup' | 'keydown' | 'keyup' | 'scroll';
    x?: number;
    y?: number;
    key?: string;
    deltaY?: number;
}

export interface SharedBrowserStartedPayload {
    channelId: string;
    producerId: string; // The Mediasoup Producer ID for the video stream
    url: string;
    ownerId: string;
}

export interface SharedBrowserStoppedPayload {
    channelId: string;
}

export interface CreateThemePayload {
    name: string;
    config: ThemeConfig;
}

export interface UpdateThemePayload {
    themeId: string;
    name?: string;
    config?: ThemeConfig;
}

export interface ThemeCreatedPayload {
    theme: CustomTheme;
}

export interface ThemeUpdatedPayload {
    theme: CustomTheme;
}

export interface ThemesListPayload {
    themes: CustomTheme[];
}

export interface DeleteThemePayload {
    themeId: string;
}

export interface ThemeDeletedPayload {
    themeId: string;
}

export interface TypingPayload {
    channelId: string;
    userId: string;
    username: string;
    isTyping: boolean;
}

export interface KickMemberPayload {
    serverId: string;
    userId: string;
    reason?: string;
}

export interface BanMemberPayload {
    serverId: string;
    userId: string;
    reason?: string;
}

export interface ServerMemberAddedPayload {
    serverId: string;
    member: ServerMember;
}

export interface ServerMemberRemovedPayload {
    serverId: string;
    userId: string;
}

export interface DevAccessGrantedPayload {
    grantedBy: string; // Username of admin
}

export interface DevAccessRevokedPayload {
    revokedBy: string; // Username of admin
}