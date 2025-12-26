import { C2S_MSG_TYPE, S2C_MSG_TYPE } from '@common/types.js';
import type {
  WebSocketMessage,
  NewMessagePayload,
  InitialStatePayload,
  ServerCreatedPayload,
  ServerUpdatedPayload,
  ServerDeletedPayload,
  ChannelCreatedPayload,
  FriendRequestAcceptedPayload,
  FriendRequestRejectedPayload,
  FriendRemovedPayload,
  FriendsListPayload,
  AuthSuccessPayload,
  AuthErrorPayload,
  WebRtcUserJoinedVoiceChannelPayload,
  WebRtcUserLeftVoiceChannelPayload,
  WebRtcExistingMembersPayload,
  WebRtcOfferPayloadS2C,
  WebRtcAnswerPayloadS2C,
  WebRtcIceCandidatePayloadS2C,
  WebRtcJoinVoiceChannelPayload,
  WebRtcLeaveVoiceChannelPayload,
  LoginWithTokenPayload,
  ReceiveDmPayload,
  SendDmPayload,
  PresenceUpdatePayload,
  UpdateStatusPayload,
  UserUpdatedPayload,
  ActivityUpdatePayload, // NEW
  DmHistoryPayload,
  GetDmHistoryPayload,
  IncomingCallPayload,
  S2CCallResponsePayload,
  CallEndedPayload,
  VerificationRequiredPayload,
  ServerMembersPayload,
  MessageUpdatedPayload,
  MessageDeletedPayload,
  UnreadCountsPayload, // NEW
  ChannelMessagesPayload, // NEW
  GetChannelMessagesPayload, // NEW
  MarkChannelReadPayload, // NEW
  StartSharedBrowserPayload, // NEW
  StopSharedBrowserPayload, // NEW
  SharedBrowserInputPayload, // NEW
  SharedBrowserStartedPayload, // NEW
  SharedBrowserStoppedPayload, // NEW
  TypingPayload // NEW
} from '@common/types.js';
import type { AppDispatch, RootState } from '../store';
import { 
  addMessage, 
  addMessages, 
  setUnreadCounts, 
  setTypingUser, 
  updateMessage,
  deleteMessage,
  addDmMessage,
  setDmMessages,
  setActiveDmConversationId,
  incrementUnreadCount,
  incrementMentionCount // ADDED THIS
} from '../store/slices/chatSlice';
import { setCatModeEnabled } from '../store/slices/settingsSlice'; // ADDED FOR REMOTE CONTROL
import {
  setSharedBrowser,
  addVoiceChannelMember as addVoiceChannelMemberVoice, 
  removeVoiceChannelMember as removeVoiceChannelMemberVoice, 
  updateVoiceState,
  setIncomingCall, // CLEAN IMPORT
  setOutgoingCall,
  setCallConnected,
  endCall
} from '../store/slices/voiceSlice';
import {
  setServers,
//   setChannels, // REMOVED
  setServerMembers,
  addServerMember,
  removeServerMember,
  setServerRoles,
  addRole,
  updateRole,
  deleteRole,
  updateMemberRoles,
  updateMemberStatus,
  updateMemberActivity,
  updateServerMemberUser, // NEW
  addServer,
  removeServer,
  updateServer,
//   addChannel, // REMOVED
//   updateChannel, // REMOVED
//   removeChannel // REMOVED
} from '../store/slices/serverSlice';
import {
  setFriendsList,
  addFriendRequest,
  removeFriendRequest,
  addFriend,
  removeFriend,
  updateUserStatus,
  setAuthSuccess,
  setAuthError,
  setAuthVerificationRequired,
  updateUserProfile,
  cacheUser,
  cacheUsers
} from '../store/slices/authSlice';
import { setThemes, addTheme, updateTheme, removeTheme } from '../store/slices/customThemeSlice';
import { 
  updatePing, 
  setChannels, 
  setVoiceStates,
  addVoiceChannelMember as addVoiceChannelMemberUI,
  removeVoiceChannelMember as removeVoiceChannelMemberUI 
} from '../store/slices/uiSlice';
import { webRTCService } from './webrtc';
import { mediasoupService } from './mediasoup';
import { db, getConversationId, type IDmMessage } from './db';
import { logService } from './LogService';

const DEFAULT_WEBSOCKET_URL = `wss://89.221.20.26:22822`;

function showNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => p === 'granted' && new Notification(title, { body }));
  }
}

function playSound(soundFile: string) {
  try {
    const audio = new Audio(soundFile);
    audio.play().catch(err => console.error("Error playing sound:", err));
  } catch (err) {
    console.error("Could not play audio file.", err);
  }
}

import { 
    playHoverSound, 
    playChatNotify, 
    playDmNotify, 
    playScreenshareStart 
} from '../utils/soundUtils';

class WebSocketService {
  private ws: WebSocket | null = null;
  private dispatch: AppDispatch | null = null;
  private getState: (() => RootState) | null = null;
  private reconnectTimeout: number | null = null;
  private userId: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private onConnectedCallbacks: Set<() => void> = new Set();
  private onReadyCallbacks: Set<() => void> = new Set();
  private syncStatus = {
      initialState: false,
      friends: false,
      unread: false,
      authDone: false,
      messagesLoaded: false
  };

  private pendingMessageRequests = new Set<string>(); // Track pending channel loads

  private pingInterval: number | null = null;
  private lastPingTime: number = 0;
  
  // Dynamic URL support
  private serverUrl: string = localStorage.getItem('serverUrl') || DEFAULT_WEBSOCKET_URL;

  constructor() {
    mediasoupService.setSignal((type, payload) => this.sendMessage(type as any, payload));
    
    mediasoupService.onScreenShareStopped(() => {
        console.log("[WS] Received onScreenShareStopped");
        if (this.dispatch && this.userId) {
            this.dispatch(updateVoiceState({ userId: this.userId, partialState: { isScreenSharing: false } }));
        }
    });

    mediasoupService.on('connectionStateChange', (state: string) => {
        if (!this.dispatch || !this.userId) return;
        
        switch (state) {
            case 'connecting':
                this.dispatch(updateVoiceState({ userId: this.userId, partialState: { isConnecting: true, isDisconnected: false } }));
                break;
            case 'connected':
                this.dispatch(updateVoiceState({ userId: this.userId, partialState: { isConnecting: false, isDisconnected: false } }));
                break;
            case 'failed':
            case 'disconnected':
            case 'closed':
                this.dispatch(updateVoiceState({ userId: this.userId, partialState: { isConnecting: false, isDisconnected: true } }));
                break;
        }
    });

    webRTCService.onConnectionStateChange((state, userId) => {
      if (!this.dispatch) return;

      switch (state) {
        case 'checking':
        case 'connecting' as any:
          this.dispatch(updateVoiceState({ userId, partialState: { isConnecting: true, isDisconnected: false } }));
          break;
        case 'connected':
          this.dispatch(updateVoiceState({ userId, partialState: { isConnecting: false, isDisconnected: false } }));
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.dispatch(updateVoiceState({ userId, partialState: { isConnecting: false, isDisconnected: true } }));
          break;
        default:
          break;
      }
    });
  }
  
  public setServerUrl(url: string) {
      this.serverUrl = url;
      localStorage.setItem('serverUrl', url);
      if (this.ws) {
          this.ws.close(); // Reconnect with new URL
      }
  }

  public getServerUrl(): string {
      return this.serverUrl;
  }

  setStore(dispatch: AppDispatch, getState: () => RootState) {
    this.dispatch = dispatch;
    this.getState = getState;
  }

  public receive(messageType: string, callback: Function): () => void {
    if (!this.listeners.has(messageType)) {
      this.listeners.set(messageType, new Set());
    }
    this.listeners.get(messageType)?.add(callback);
    return () => {
      this.listeners.get(messageType)?.delete(callback);
      if (this.listeners.get(messageType)?.size === 0) {
        this.listeners.delete(messageType);
      }
    };
  }

  getUserId(): string | null {
    return this.userId;
  }

  public onConnected(callback: () => void) {
      this.onConnectedCallbacks.add(callback);
      if (this.ws?.readyState === WebSocket.OPEN) {
          callback();
      }
      return () => this.onConnectedCallbacks.delete(callback);
  }

  public onSyncReady(callback: () => void) {
      this.onReadyCallbacks.add(callback);
      if (this.isSyncComplete()) {
          callback();
      }
      return () => this.onReadyCallbacks.delete(callback);
  }

  private isSyncComplete() {
      const token = localStorage.getItem('authToken');
      if (!token) return true; // No token, no sync needed (AuthScreen will show)
      return this.syncStatus.authDone && 
             this.syncStatus.initialState && 
             this.syncStatus.friends && 
             this.syncStatus.unread && 
             this.syncStatus.messagesLoaded;
  }

  private checkSyncAndNotify() {
      if (this.isSyncComplete()) {
          this.onReadyCallbacks.forEach(cb => cb());
      }
  }

  private updateSyncProgress(key: keyof typeof this.syncStatus, status: string) {
      this.syncStatus[key] = true;
      // @ts-ignore
      if (window.electron) window.electron.send('sync-status-update', status);
      // Also trigger a custom event for React
      window.dispatchEvent(new CustomEvent('murchat-sync-update', { detail: status }));
      this.checkSyncAndNotify();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    console.log(`Attempting to connect WebSocket to ${this.serverUrl}...`);
    
    const ws = new WebSocket(this.serverUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      this.onConnectedCallbacks.forEach(cb => cb());
      this.startPingLoop();
      
      const token = localStorage.getItem('authToken');
      if (token) {
          console.log('Found auth token, attempting login...');
          const payload: LoginWithTokenPayload = { token };
          const message: WebSocketMessage<LoginWithTokenPayload> = {
              type: C2S_MSG_TYPE.LOGIN_WITH_TOKEN,
              payload
          };
          ws.send(JSON.stringify(message));
      }
    };

    ws.onmessage = async (event) => {
      try {
        const message: WebSocketMessage<unknown> = JSON.parse(event.data as string);

        if (this.dispatch && this.getState) {
          const state = this.getState();
          const { settings, auth, chat, server, voice, ui } = state;

          switch (message.type) {
            case S2C_MSG_TYPE.PONG:
                {
                    const latency = Date.now() - this.lastPingTime;
                    this.dispatch(updatePing(latency));
                }
                break;

            case S2C_MSG_TYPE.AUTH_SUCCESS: 
              {
                const payload = message.payload as AuthSuccessPayload;
                this.userId = payload.userId;
                mediasoupService.setUserId(payload.userId); // NEW
                
                if (payload.token) {
                    localStorage.setItem('authToken', payload.token);
                }

                // --- DEVTOOLS SECURITY UNLOCK ---
                const userTag = `${payload.username}#${payload.discriminator}`;
                if (['LINKO#5693', 'Enterprise#2597'].includes(userTag)) {
                    // @ts-ignore
                    if (window.electron && window.electron.unlockDevTools) {
                        // @ts-ignore
                        window.electron.unlockDevTools();
                        console.log(`DevTools unlocked for authorized user: ${userTag}`);
                    }
                }
                // --------------------------------

                                this.dispatch(setAuthSuccess({
                                    userId: payload.userId,
                                    username: payload.username,
                                    discriminator: payload.discriminator,
                                    email: payload.email,
                                    avatar: payload.avatar,
                                    bio: payload.bio,
                                    profile_banner: payload.profile_banner,
                                    profile_theme: payload.profile_theme,
                                    isDeveloper: payload.isDeveloper
                                }));
                                
                                this.updateSyncProgress('authDone', 'Авторизация завершена...');
                
                                this.sendMessage(C2S_MSG_TYPE.GET_FRIENDS, {});                this.sendMessage(C2S_MSG_TYPE.GET_THEMES, {}); // Fetch themes

                // Restore selected server state on backend
                const currentState = this.getState ? this.getState() : null;
                if (currentState && currentState.server.selectedServerId) {
                    console.log('Restoring selected server on backend:', currentState.server.selectedServerId);
                    this.sendMessage(C2S_MSG_TYPE.SET_SELECTED_SERVER, { selectedServerId: currentState.server.selectedServerId });
                }
              }
              break;
            
            case S2C_MSG_TYPE.PRESENCE_UPDATE:
                {
                    const payload = message.payload as PresenceUpdatePayload;
                    this.dispatch(updateUserStatus(payload));
                    this.dispatch(updateMemberStatus(payload));
                }
                break;

            case S2C_MSG_TYPE.ACTIVITY_UPDATE:
                {
                    const payload = message.payload as ActivityUpdatePayload;
                    this.dispatch(updateMemberActivity({ userId: payload.userId, activity: payload.activity }));
                }
                break;
            
            case S2C_MSG_TYPE.UNREAD_COUNTS:
                {
                    const payload = message.payload as UnreadCountsPayload;
                    this.dispatch(setUnreadCounts(payload));
                    this.updateSyncProgress('unread', 'Синхронизация сообщений...');
                }
                break;

            case S2C_MSG_TYPE.CHANNEL_MESSAGES:
                {
                    const payload = message.payload as ChannelMessagesPayload;
                    this.dispatch(addMessages(payload.messages));
                    
                    if (this.pendingMessageRequests.has(payload.channelId)) {
                        this.pendingMessageRequests.delete(payload.channelId);
                        if (this.pendingMessageRequests.size === 0) {
                            this.updateSyncProgress('messagesLoaded', 'Все чаты загружены...');
                        } else {
                            console.log(`[Sync] Waiting for ${this.pendingMessageRequests.size} more channels...`);
                        }
                    } else if (!this.syncStatus.messagesLoaded) {
                        // Fallback if we received a message update that wasn't pending but we are still waiting?
                        // No, stick to the Set logic.
                    }
                }
                break;

            case S2C_MSG_TYPE.SHARED_BROWSER_STARTED:
                {
                    const payload = message.payload as SharedBrowserStartedPayload;
                    console.log('[SharedBrowser] Started via signal.', payload);
                    this.dispatch(setSharedBrowser({
                        isActive: true,
                        producerId: null, // Producer will arrive via Mediasoup newPeerProducer
                        url: payload.url,
                        ownerId: payload.ownerId
                    }));
                    // Do NOT consume here manually anymore.
                    // We wait for the owner to start screen share, which triggers onNewPeerProducer -> MS_CONSUME logic automatically in mediasoup.ts.
                }
                break;

            case S2C_MSG_TYPE.SHARED_BROWSER_STOPPED:
                {
                    const payload = message.payload as SharedBrowserStoppedPayload;
                    console.log('[SharedBrowser] Stopped.');
                    
                    // If I was the owner, stop the actual screen share
                    const state = this.getState ? this.getState() : null;
                    if (state && state.voice.sharedBrowser.ownerId === this.userId) {
                        console.log('[SharedBrowser] I was owner, stopping browser share...');
                        mediasoupService.stopBrowserShare();
                    }

                    this.dispatch(setSharedBrowser({
                        isActive: false,
                        producerId: null,
                        url: null,
                        ownerId: null
                    }));
                }
                break;
              
            case S2C_MSG_TYPE.RECEIVE_DM:
                {
                    if (!this.userId) break;
                    const payload = message.payload as ReceiveDmPayload;
                    const conversationId = getConversationId(payload.senderId, this.userId);
                    
                    const newMessage: IDmMessage = {
                        messageId: payload.messageId,
                        conversationId,
                        senderId: payload.senderId,
                        recipientId: this.userId,
                        content: payload.content,
                        timestamp: payload.timestamp,
                        isSent: true,
                        audioData: payload.audioData
                    };

                    // 1. Dispatch to UI immediately for speed
                    this.dispatch!(addDmMessage(newMessage));

                    // 2. Save to DB in background
                    db.dmMessages.add(newMessage).catch(err => {
                        console.error('Failed to save incoming DM to DB:', err);
                    });

                    const state = this.getState!();
                    if (state.chat.activeDmConversationId !== payload.senderId) {
                        if (state.settings.notifyOnDm) { // CHECK SETTING
                            const sender = state.auth.friends.find(f => f.id === payload.senderId);
                            if (state.settings.enableDesktopNotifications) {
                                showNotification(`New DM from ${sender?.username || 'Someone'}`, payload.content);
                            }
                            if (state.settings.enableSoundNotifications) {
                                playDmNotify();
                            }
                        }
                    }
                }
                break;

            case S2C_MSG_TYPE.FRIENDS_LIST:
              {
                const payload = message.payload as FriendsListPayload;
                this.dispatch(setFriendsList(payload));
                this.updateSyncProgress('friends', 'Список друзей получен...');
              }
              break;

        case S2C_MSG_TYPE.DM_HISTORY:
          const historyPayload = message.payload as DmHistoryPayload;
          if (!this.userId) break;
          
          const historyConvId = getConversationId(this.userId, historyPayload.recipientId);
          
          const mappedMessages = historyPayload.messages.map(msg => ({
              messageId: msg.id,
              conversationId: historyConvId,
              senderId: msg.senderId,
              recipientId: msg.recipientId, 
              content: msg.content,
              timestamp: msg.timestamp,
              isSent: msg.senderId === this.userId
          }));
          
          db.transaction('rw', db.dmMessages, async () => {
              for (const msg of mappedMessages) {
                  const exists = await db.dmMessages.where('messageId').equals(msg.messageId).count();
                  if (exists === 0) {
                      // @ts-ignore
                      await db.dmMessages.add(msg);
                  }
              }
          }).catch(err => console.error('Failed to save DM history:', err));
          
          this.dispatch(setDmMessages({ conversationId: historyConvId, messages: mappedMessages }));
          
          console.log(`[WS] Received history for ${historyPayload.recipientId}: ${mappedMessages.length} msgs`);
          break;

        case S2C_MSG_TYPE.INCOMING_CALL: {
            const payload = message.payload as IncomingCallPayload;
            this.dispatch(setIncomingCall({ 
                callerId: payload.caller.id, 
                callerData: { username: payload.caller.username, avatar: payload.caller.avatar } 
            }));
            playDmNotify(); 
            break;
        }

        case S2C_MSG_TYPE.CALL_RESPONSE: {
            const payload = message.payload as S2CCallResponsePayload;
            if (payload.accepted) {
                this.dispatch(setCallConnected());
                this.startP2PConnection(payload.responderId, true);
            } else {
                this.dispatch(endCall());
                alert('Call rejected');
            }
            break;
        }

        case S2C_MSG_TYPE.CALL_ENDED: {
            const payload = message.payload as CallEndedPayload;
            this.dispatch(endCall());
            webRTCService.closeAllConnections();
            console.log('Call ended:', payload.reason);
            break;
        }

        case S2C_MSG_TYPE.FRIEND_REQUEST_SENT:
               this.sendMessage(C2S_MSG_TYPE.GET_FRIENDS, {});
               break;

            case S2C_MSG_TYPE.FRIEND_REQUEST_RECEIVED:
              {
                const payload = message.payload as any; // FriendRequestReceivedPayload
                this.dispatch(addFriendRequest({ user: payload.fromUser, type: 'incoming' }));
                showDesktopNotification("New Friend Request", `${payload.fromUser.username} sent you a friend request!`);
                playChatNotify(); // Changed to chat notification sound
                console.log('Received FRIEND_REQUEST_RECEIVED:', payload);
              }
              break;

            case S2C_MSG_TYPE.FRIEND_REQUEST_ACCEPTED:
               {
                   const payload = message.payload as FriendRequestAcceptedPayload;
                   this.dispatch(addFriend(payload.user));
                   showNotification('Friend Request Accepted', `${payload.user.username} is now your friend!`);
               }
               break;

            case S2C_MSG_TYPE.FRIEND_REQUEST_REJECTED:
               {
                   const payload = message.payload as FriendRequestRejectedPayload;
                   this.dispatch(removeFriendRequest(payload.userId));
               }
               break;

            case S2C_MSG_TYPE.FRIEND_REMOVED:
               {
                   const payload = message.payload as FriendRemovedPayload;
                   this.dispatch(removeFriend(payload.friendId));
               }
               break;

            case S2C_MSG_TYPE.THEMES_LIST:
                {
                    const payload = message.payload as any;
                    this.dispatch(setThemes(payload.themes));
                }
                break;

            case S2C_MSG_TYPE.THEME_CREATED:
                {
                    const payload = message.payload as any;
                    this.dispatch(addTheme(payload.theme));
                }
                break;

            case S2C_MSG_TYPE.THEME_UPDATED:
                {
                    const payload = message.payload as any;
                    this.dispatch(updateTheme(payload.theme));
                }
                break;
            
            case S2C_MSG_TYPE.THEME_DELETED:
                {
                    const payload = message.payload as any;
                    this.dispatch(removeTheme(payload.themeId));
                }
                break;

            case S2C_MSG_TYPE.AUTH_ERROR:
              {
                const payload = message.payload as AuthErrorPayload;
                this.dispatch(setAuthError(payload.error));
                console.error('Auth error:', payload.error);
                localStorage.removeItem('authToken'); 
              }
              break;

            case S2C_MSG_TYPE.VERIFICATION_REQUIRED:
                {
                    const payload = message.payload as VerificationRequiredPayload;
                    this.dispatch(setAuthVerificationRequired(payload));
                    localStorage.removeItem('authToken'); 
                }
                break;

            case S2C_MSG_TYPE.PASSWORD_CHANGED:
                {
                    const payload = message.payload as any;
                    if (payload.success) {
                        alert('Пароль успешно изменен. Пожалуйста, войдите снова.');
                        localStorage.removeItem('authToken');
                        location.reload(); 
                    } else {
                        alert(`Ошибка смены пароля: ${payload.error}`);
                    }
                }
                break;

            case S2C_MSG_TYPE.USER_TYPING:
                {
                    const payload = message.payload as TypingPayload;
                    this.dispatch(setTypingUser(payload));
                }
                break;

            case S2C_MSG_TYPE.DEV_ACCESS_GRANTED:
                {
                    // @ts-ignore
                    if (window.electron && window.electron.unlockDevTools) {
                        // @ts-ignore
                        window.electron.unlockDevTools();
                        // @ts-ignore
                        window.electron.openDevTools(); 
                        alert("Вам предоставлен доступ разработчика (DevTools unlocked).");
                    }
                }
                break;

            case S2C_MSG_TYPE.DEV_ACCESS_REVOKED:
                {
                    // @ts-ignore
                    if (window.electron && window.electron.lockDevTools) {
                        // @ts-ignore
                        window.electron.lockDevTools();
                        alert("Доступ разработчика отозван.");
                    }
                }
                break;

            case S2C_MSG_TYPE.REQUEST_LOG_DUMP:
                {
                    console.log("[DEV] Server requested a log dump. Uploading...");
                    logService.forceUpload();
                }
                break;

            case S2C_MSG_TYPE.RELOAD_APP:
                {
                    console.log("[DEV] Server issued Order 66: RELOAD.");
                    location.reload();
                }
                break;

            case S2C_MSG_TYPE.FORCE_CAT_MODE:
                {
                    const { enabled } = message.payload as { enabled: boolean };
                    this.dispatch(setCatModeEnabled(enabled));
                    console.log(`[DEV] Server forced Cat Mode: ${enabled}`);
                }
                break;

            case S2C_MSG_TYPE.SHOW_ANNOUNCEMENT:
                {
                    const { content } = message.payload as { content: string };
                    alert(`📢 ОБЪЯВЛЕНИЕ ОТ РАЗРАБОТЧИКА:\n\n${content}`);
                }
                break;

            case S2C_MSG_TYPE.NEW_MESSAGE:
              {
                const payload = message.payload as NewMessagePayload;
                const receivedMessage = payload.message;
                const state = this.getState!();

                // 1. Add message to store
                this.dispatch!(addMessage(receivedMessage));
                
                // 2. Increment unread count if channel is not active
                const isCurrentChannel = state.server.selectedChannelId === receivedMessage.channelId;
                
                if (!isCurrentChannel) {
                    this.dispatch!(incrementUnreadCount(receivedMessage.channelId));
                }

                console.log('Received NEW_MESSAGE:', receivedMessage);
                
                if (receivedMessage.authorId !== this.userId) {
                  // MENTION DETECTION: Escape username for regex
                  const escapedUsername = (state.auth.username || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const mentionRegex = new RegExp(`@${escapedUsername}\\b`, 'i');
                  const isMention = mentionRegex.test(receivedMessage.content);
                  
                  if (isMention) {
                      this.dispatch!(incrementMentionCount(receivedMessage.channelId));
                  }

                  // Find channel and server names for notification
                  const channel = state.ui.channels.find(c => c.id === receivedMessage.channelId);
                  const server = channel ? state.server.servers.find(s => s.id === channel.serverId) : null;
                  
                  const contextTitle = server ? `${server.name} > #${channel?.name}` : `#${channel?.name || 'Message'}`;

                  let shouldNotify = false;
                  // If it's a mention, check notifyOnMention setting
                  if (isMention && state.settings.notifyOnMention) shouldNotify = true;
                  
                  // If it's just a message, and we NOT mentioned, only notify if we really want to (currently no separate setting for "all server messages")
                  // Using state.settings to be safe
                  if (!isMention && state.settings.notifyOnDm) shouldNotify = false; 

                  if (shouldNotify) {
                    if (state.settings.enableDesktopNotifications) {
                      showNotification(
                          isMention ? `Упоминание от ${receivedMessage.author}` : `Новое сообщение в ${contextTitle}`,
                          `${receivedMessage.author}: ${receivedMessage.content.substring(0, 100)}${receivedMessage.content.length > 100 ? '...' : ''}`
                      );
                    }
                    if (state.settings.enableSoundNotifications) {
                      playChatNotify(); 
                    }
                  }
                }
              }
              break;

            case S2C_MSG_TYPE.MESSAGE_UPDATED:
              {
                  const payload = message.payload as MessageUpdatedPayload;
                  this.dispatch(updateMessage({ messageId: payload.messageId, content: payload.content }));
              }
              break;

            case S2C_MSG_TYPE.MESSAGE_DELETED:
              {
                  const payload = message.payload as MessageDeletedPayload;
                  this.dispatch!(deleteMessage(payload.messageId));
              }
              break;

            case S2C_MSG_TYPE.MESSAGE_PINNED:
              {
                  const payload = message.payload as any;
                  this.dispatch!(updateMessage({ messageId: payload.messageId, isPinned: true }));
              }
              break;

            case S2C_MSG_TYPE.MESSAGE_UNPINNED:
              {
                  const payload = message.payload as any;
                  this.dispatch!(updateMessage({ messageId: payload.messageId, isPinned: false }));
              }
              break;

            case S2C_MSG_TYPE.INITIAL_STATE:
              {
                const payload = message.payload as InitialStatePayload;
                this.dispatch(setServers(payload.servers));
                this.dispatch(setChannels(payload.channels)); // Dispatches to uiSlice
                
                // Initialize voiceStates in voiceSlice
                if (payload.voiceStates) {
                    const members = Object.values(payload.voiceStates).map(vs => ({
                        userId: vs.userId,
                        username: vs.username,
                        avatar: vs.userAvatar || undefined
                    }));
                    // Find which channel I am in, if any
                    const myId = this.userId;
                    const myState = myId ? payload.voiceStates[myId] : null;
                    if (myState) {
                        this.dispatch(setVoiceChannel({ channelId: myState.channelId, members }));
                    }
                }
                
                // BULK PRELOAD CHATS FOR SELECTED SERVER
                const state = this.getState ? this.getState() : null;
                const selectedServerId = state?.server?.selectedServerId;
                
                this.pendingMessageRequests.clear(); // Reset just in case

                if (selectedServerId) {
                    const serverChannels = payload.channels.filter(c => c.serverId === selectedServerId && c.type === 'text');
                    
                    if (serverChannels.length > 0) {
                        console.log(`[Sync] Preloading messages for ${serverChannels.length} channels in server ${selectedServerId}`);
                        for (const channel of serverChannels) {
                            this.pendingMessageRequests.add(channel.id);
                            this.getChannelMessages(channel.id, 50);
                        }
                        
                        // Safety timeout: if server doesn't respond for some channels, finish anyway
                        setTimeout(() => {
                            if (this.pendingMessageRequests.size > 0) {
                                console.warn(`[Sync] Timeout waiting for ${this.pendingMessageRequests.size} channels. Forcing completion.`);
                                this.pendingMessageRequests.clear();
                                this.updateSyncProgress('messagesLoaded', 'Загрузка чатов завершена (по таймауту)...');
                            }
                        }, 8000); // 8 seconds timeout
                    } else {
                        this.updateSyncProgress('messagesLoaded', 'Нет текстовых каналов для загрузки...');
                    }
                } else {
                    this.updateSyncProgress('messagesLoaded', 'Сервер не выбран...');
                }

                this.updateSyncProgress('initialState', 'Сервера и каналы загружены...');
              }
              break;

            case S2C_MSG_TYPE.SERVER_CREATED:
              {
                const payload = message.payload as ServerCreatedPayload;
                this.dispatch(addServer(payload.server));
              }
              break;

            case S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE:
              {
                const payload = message.payload as any; // VoiceStateUpdatePayload
                const partialState: any = { 
                    isScreenSharing: payload.isScreenSharing 
                };
                // Only update channelId if explicitly provided
                if (payload.channelId !== undefined) {
                    partialState.channelId = payload.channelId;
                }
                
                this.dispatch(updateVoiceState({ 
                    userId: payload.userId, 
                    partialState
                }));
              }
              break;

            case S2C_MSG_TYPE.SERVER_UPDATED:
              {
                const payload = message.payload as ServerUpdatedPayload;
                this.dispatch(updateServer(payload.server));
              }
              break;

            case S2C_MSG_TYPE.S2C_SERVER_MEMBERS:
              {
                const payload = message.payload as ServerMembersPayload;
                this.dispatch(setServerMembers(payload.members));
                this.dispatch(cacheUsers(payload.members)); // Sync with global cache
                console.log('Received SERVER_MEMBERS:', payload.members.length);
              }
              break;

            case S2C_MSG_TYPE.S2C_SERVER_MEMBER_ADDED:
              {
                  const payload = message.payload as any; // ServerMemberAddedPayload
                  const state = this.getState();
                  if (state.server.selectedServerId === payload.serverId) {
                      this.dispatch(addServerMember(payload.member));
                      this.dispatch(cacheUser(payload.member)); // Sync with global cache
                      console.log(`[WS] New member added to current server: ${payload.member.username}`);
                  }
              }
              break;

            case S2C_MSG_TYPE.S2C_SERVER_MEMBER_REMOVED:
              {
                  const payload = message.payload as any; // ServerMemberRemovedPayload
                  const state = this.getState();
                  if (state.server.selectedServerId === payload.serverId) {
                      this.dispatch(removeServerMember(payload.userId));
                      console.log(`[WS] Member removed from current server: ${payload.userId}`);
                  }
              }
              break;

            case S2C_MSG_TYPE.SERVER_DELETED:
              {
                const payload = message.payload as ServerDeletedPayload;
                console.log('Client received SERVER_DELETED:', payload);
                this.dispatch(removeServer(payload.serverId));
              }
              break;

            case S2C_MSG_TYPE.CHANNEL_CREATED:
              {
                const payload = message.payload as ChannelCreatedPayload;
                // Get current channels from uiSlice state
                const currentChannels = this.getState().ui.channels;
                // Add the new channel
                const updatedChannels = [...currentChannels, payload.channel];
                // Dispatch the updated list to uiSlice
                this.dispatch(setChannels(updatedChannels));
              }
              break;

            case S2C_MSG_TYPE.CHANNEL_UPDATED:
              {
                  const payload = message.payload as any; // ChannelUpdatedPayload
                  const currentChannels = this.getState().ui.channels;
                  const updatedChannels = currentChannels.map(c => 
                      c.id === payload.channel.id ? payload.channel : c
                  );
                  this.dispatch(setChannels(updatedChannels));
              }
              break;

            case S2C_MSG_TYPE.CHANNEL_DELETED:
              {
                  const payload = message.payload as any; // ChannelDeletedPayload
                  const currentChannels = this.getState().ui.channels;
                  const updatedChannels = currentChannels.filter(c => c.id !== payload.channelId);
                  this.dispatch(setChannels(updatedChannels));
              }
              break;

            case S2C_MSG_TYPE.S2C_SERVER_ROLES:
              {
                  const payload = message.payload as any; // ServerRolesPayload
                  this.dispatch(setServerRoles(payload.roles));
              }
              break;

            case S2C_MSG_TYPE.S2C_ROLE_CREATED:
              {
                  const payload = message.payload as any; // RoleCreatedPayload
                  this.dispatch(addRole(payload.role));
              }
              break;
            
            case S2C_MSG_TYPE.S2C_ROLE_UPDATED:
              {
                  const payload = message.payload as any;
                  this.dispatch(updateRole(payload.role));
              }
              break;

            case S2C_MSG_TYPE.S2C_ROLE_DELETED:
              {
                  const payload = message.payload as any;
                  this.dispatch(deleteRole(payload.roleId));
              }
              break;

            case S2C_MSG_TYPE.S2C_MEMBER_ROLES_UPDATED:
              {
                  const payload = message.payload as any;
                  this.dispatch(updateMemberRoles({ userId: payload.userId, roleIds: payload.roleIds }));
              }
              break;
            
            case S2C_MSG_TYPE.S2C_WEBRTC_EXISTING_VOICE_MEMBERS:
                {
                    if (!this.userId) break;
                    const { channelId, members } = message.payload as WebRtcExistingMembersPayload;
                    
                    console.log('Received S2C_WEBRTC_EXISTING_VOICE_MEMBERS:', members);

                    for (const member of members) {
                        const memberData = { 
                            userId: member.userId, 
                            channelId, 
                            username: member.username, 
                            avatar: member.userAvatar || undefined, 
                            currentUserId: this.userId 
                        };
                        // Dispatch to BOTH slices to keep UI in sync
                        this.dispatch(addVoiceChannelMemberVoice(memberData));
                        this.dispatch(addVoiceChannelMemberUI({ 
                            userId: member.userId, 
                            channelId, 
                            username: member.username, 
                            userAvatar: member.userAvatar || undefined 
                        }));
                    }
                }
                break;

            case S2C_MSG_TYPE.S2C_WEBRTC_USER_JOINED_VOICE_CHANNEL:
                {
                  if (!this.userId) break;
                  const { channelId, userId: remoteUserId, username, userAvatar } = message.payload as WebRtcUserJoinedVoiceChannelPayload;
                  console.log(`[WS] User joined voice: ${remoteUserId} (Me: ${this.userId})`); 
                  
                  const memberData = { userId: remoteUserId, channelId, username, avatar: userAvatar || undefined, currentUserId: this.userId };
                  // Update BOTH slices
                  this.dispatch(addVoiceChannelMemberVoice(memberData));
                  this.dispatch(addVoiceChannelMemberUI({ userId: remoteUserId, channelId, username, userAvatar: userAvatar || undefined }));

                  if (settings.enableSoundNotifications && settings.playUserJoinLeaveSounds) {
                      playChatNotify(); 
                  }

                  if (remoteUserId === this.userId) {
                      console.log('[SFU] Server confirmed join. Initializing Mediasoup...');
                      mediasoupService.joinChannel(channelId);
                  }
                }
                break;

            case S2C_MSG_TYPE.S2C_WEBRTC_USER_LEFT_VOICE_CHANNEL:
                {
                    const { userId: remoteUserId } = message.payload as WebRtcUserLeftVoiceChannelPayload;
                    // Update BOTH slices
                    this.dispatch(removeVoiceChannelMemberVoice({ userId: remoteUserId, currentUserId: this.userId }));
                    this.dispatch(removeVoiceChannelMemberUI(remoteUserId));

                    if (settings.enableSoundNotifications && settings.playUserJoinLeaveSounds) {
                        playChatNotify(); 
                    }
                }
                break;

            // --- Mediasoup Signaling Handlers ---
            case S2C_MSG_TYPE.MS_ROUTER_RTP_CAPABILITIES:
                mediasoupService.onRouterRtpCapabilities(message.payload);
                break;
            case S2C_MSG_TYPE.MS_WEBRTC_TRANSPORT_CREATED:
                mediasoupService.onWebRtcTransportCreated(message.payload);
                break;
            case S2C_MSG_TYPE.MS_TRANSPORT_CONNECTED:
                mediasoupService.onTransportConnected(message.payload);
                break;
            case S2C_MSG_TYPE.MS_PRODUCER_CREATED:
                mediasoupService.onProducerCreated(message.payload);
                break;
            case S2C_MSG_TYPE.MS_CONSUMER_CREATED:
                mediasoupService.onConsumerCreated(message.payload);
                break;
            case S2C_MSG_TYPE.MS_NEW_PEER_PRODUCER:
                {
                    const payload = message.payload as any;
                    // Auto-update UI state if this is a screen share or webcam
                    if (payload.appData?.source === 'screen') {
                        this.dispatch(updateVoiceState({ userId: payload.userId, partialState: { isScreenSharing: true } }));
                    } else if (payload.appData?.source === 'webcam') {
                        this.dispatch(updateVoiceState({ userId: payload.userId, partialState: { isVideoEnabled: true } }));
                    }
                    mediasoupService.onNewPeerProducer(payload);
                }
                break;
            case S2C_MSG_TYPE.MS_PRODUCER_CLOSED:
                {
                    const payload = message.payload as any;
                    // We don't know the source here easily, but MediasoupService will close it.
                    // We'll rely on global state or appData from the producer if we had it.
                    // For now, let's just let Mediasoup handle it and the UI will sync via other messages
                    // OR we can explicitly clear states if we find who owned this producer.
                    mediasoupService.onProducerClosed(payload);
                }
                break;

            case S2C_MSG_TYPE.USER_UPDATED:
              {
                const payload = message.payload as UserUpdatedPayload;
                console.log('[WS] Received USER_UPDATED:', payload);
                
                if (payload.userId === this.userId) {
                    this.dispatch(updateUserProfile({
                        avatar: payload.user.avatar,
                        profile_banner: payload.user.profile_banner,
                        username: payload.user.username,
                        bio: payload.user.bio,
                        profile_theme: payload.user.profile_theme,
                    }));
                } else {
                    // Update cached user data for others (popups, lists)
                    this.dispatch(cacheUser(payload.user));
                    
                    // Update server member list if they are there
                    this.dispatch(updateServerMemberUser(payload.user));
                }
              }
              break;
          }
          // Notify any registered listeners for this message type
          this.listeners.get(message.type)?.forEach(callback => callback(message.payload));
        }
      } catch (error: any) {
        console.error(`Error processing WebSocket message [${(event.data as string).substring(0, 100)}...]:`, error.message || error);
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        console.log('WebSocket disconnected. Attempting to reconnect...');
        this.ws = null; 
        this.stopPingLoop();
        webRTCService.closeAllConnections();
        if (!this.reconnectTimeout) {
          this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        }
      }
    };
    
    this.ws = ws;
  }

  private startPingLoop() {
      this.stopPingLoop();
      this.pingInterval = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
              this.lastPingTime = Date.now();
              this.ws.send(JSON.stringify({ type: C2S_MSG_TYPE.PING, payload: {} }));
          }
      }, 5000); // Ping every 5 seconds
  }

  private stopPingLoop() {
      if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
      }
  }

  public updateStatus(status: UpdateStatusPayload['status']) {
    this.sendMessage(C2S_MSG_TYPE.UPDATE_STATUS, { status });
  }

  public deleteMessage(messageId: string, channelId: string) {
      this.sendMessage(C2S_MSG_TYPE.DELETE_MESSAGE, { messageId, channelId });
  }

  public editMessage(messageId: string, channelId: string, content: string) {
      this.sendMessage(C2S_MSG_TYPE.EDIT_MESSAGE, { messageId, channelId, content });
  }

  public getChannelMessages(channelId: string, limit?: number, beforeTimestamp?: number) {
      const payload: GetChannelMessagesPayload = { channelId, limit, beforeTimestamp };
      this.sendMessage(C2S_MSG_TYPE.GET_CHANNEL_MESSAGES, payload);
  }

  public markChannelRead(channelId: string) {
      const payload: MarkChannelReadPayload = { channelId };
      this.sendMessage(C2S_MSG_TYPE.MARK_CHANNEL_READ, payload);
  }

  public startSharedBrowser(channelId: string, url: string) {
      const payload: StartSharedBrowserPayload = { channelId, url };
      this.sendMessage(C2S_MSG_TYPE.START_SHARED_BROWSER, payload);
  }

  public stopSharedBrowser(channelId: string) {
      const payload: StopSharedBrowserPayload = { channelId };
      this.sendMessage(C2S_MSG_TYPE.STOP_SHARED_BROWSER, payload);
  }

  public sendSharedBrowserInput(payload: SharedBrowserInputPayload) {
      this.sendMessage(C2S_MSG_TYPE.SHARED_BROWSER_INPUT, payload);
  }

  public sendTypingStart(channelId: string) {
      this.sendMessage(C2S_MSG_TYPE.TYPING_START, { channelId });
  }

  public sendTypingStop(channelId: string) {
      this.sendMessage(C2S_MSG_TYPE.TYPING_STOP, { channelId });
  }

  sendMessage<T>(type: C2S_MSG_TYPE, payload: T) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage<T> = { type, payload };
      console.log(`[WS] Sending ${type}:`, payload);
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Cannot send message.');
    }
  }
  
  public async sendDm(recipientId: string, content: string, attachments?: any[], audioData?: string) {
    if (!this.userId) {
        console.error("Cannot send DM without a user ID.");
        return;
    }
    
    const messageId = crypto.randomUUID();
    const timestamp = Date.now();
    const conversationId = getConversationId(this.userId, recipientId);

    const newMessage: IDmMessage = {
        messageId,
        conversationId,
        senderId: this.userId,
        recipientId,
        content,
        timestamp,
        isSent: true,
        audioData: audioData // ADDED THIS
    };

    try {
        await db.dmMessages.add(newMessage);
    } catch (error) {
        console.error("Failed to save DM to DB, sending anyway:", error);
    }

    if (this.dispatch) {
        this.dispatch(addDmMessage(newMessage));
    }

    try {
        const payload: SendDmPayload = {
            messageId,
            recipientId,
            content,
            timestamp,
            attachments,
            audioData // ADDED THIS
        };
        this.sendMessage(C2S_MSG_TYPE.SEND_DM, payload);
    } catch (error) {
        console.error("Failed to send DM via WebSocket:", error);
    }
  }

  public getDmHistory(recipientId: string) {
      this.sendMessage(C2S_MSG_TYPE.GET_DM_HISTORY, { recipientId });
  }

  public startCall(recipientId: string, recipientData: { username: string; avatar?: string }) {
      this.sendMessage(C2S_MSG_TYPE.CALL_REQUEST, { recipientId });
      this.dispatch(setOutgoingCall({ recipientId, recipientData }));
  }

  public acceptCall(callerId: string) {
      this.sendMessage(C2S_MSG_TYPE.CALL_RESPONSE, { callerId, accepted: true });
      this.dispatch(setCallConnected());
      this.startP2PConnection(callerId, false); 
  }

  public rejectCall(callerId: string) {
      this.sendMessage(C2S_MSG_TYPE.CALL_RESPONSE, { callerId, accepted: false });
      this.dispatch(endCall());
  }

  public hangupCall(recipientId: string) {
      this.sendMessage(C2S_MSG_TYPE.CALL_HANGUP, { recipientId });
      this.dispatch(endCall());
      webRTCService.closeAllConnections();
  }

  private async startP2PConnection(targetUserId: string, isInitiator: boolean) {
      console.log(`[WebRTC] startP2PConnection called. Initiator: ${isInitiator}. Force cleaning up old connections.`);
      webRTCService.closeAllConnections();

      const state = this.getState();
      const { settings, auth } = state;
      
      const constraints = {
          deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined,
          noiseSuppression: settings.noiseSuppression,
          echoCancellation: settings.echoCancellation
      };
      
      try {
        await webRTCService.startLocalStream(constraints, settings.inputVolume, settings.vadThreshold);
        
        if (isInitiator) {
            console.log('Starting P2P connection as Initiator');
            const pc = webRTCService.createPeerConnection(targetUserId, (candidate) => {
                this.sendMessage(C2S_MSG_TYPE.C2S_WEBRTC_ICE_CANDIDATE, {
                    targetUserId,
                    senderUserId: this.userId!,
                    candidate: candidate.toJSON()
                });
            });
            
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.sendMessage(C2S_MSG_TYPE.C2S_WEBRTC_OFFER, {
                targetUserId,
                senderUserId: this.userId!,
                username: auth.username || 'Unknown',
                userAvatar: auth.avatar || undefined,
                offer
            });
        } else {
            console.log('Starting P2P connection as Receiver (waiting for offer)');
        }
      } catch (e) {
          console.error('Error starting P2P connection:', e);
          this.hangupCall(targetUserId);
      }
  }

  public login(email: string, password: string) {
      this.sendMessage(C2S_MSG_TYPE.LOGIN, { email, password });
      console.log('Attempting LOGIN.');
  }

  public register(email: string, username: string, password: string) {
      this.sendMessage(C2S_MSG_TYPE.REGISTER, { email, username, password });
      console.log('Attempting REGISTER.');
  }

  public verifyEmail(email: string, code: string) {
      this.sendMessage(C2S_MSG_TYPE.VERIFY_EMAIL, { email, code });
  }

  public changePassword(oldPassword: string, newPassword: string) {
      this.sendMessage(C2S_MSG_TYPE.CHANGE_PASSWORD, { oldPassword, newPassword });
  }

  public joinVoiceChannel(channelId: string) {
    if (!this.userId) {
        console.error("Cannot join voice channel without a user ID.");
        return;
    }
    console.log(`Requesting to join voice channel: ${channelId}`);
    const username = this.getState ? this.getState().auth.username || 'Unknown' : 'Unknown';
    
    this.sendMessage(C2S_MSG_TYPE.C2S_WEBRTC_JOIN_VOICE_CHANNEL, { channelId, userId: this.userId, username });
  }

  public leaveVoiceChannel(channelId: string) {
      if (!this.userId) {
          console.error("Cannot leave voice channel without a user ID.");
          return;
      }
      console.log(`Leaving voice channel: ${channelId}`);
      mediasoupService.leave();
      this.sendMessage(C2S_MSG_TYPE.C2S_WEBRTC_LEAVE_VOICE_CHANNEL, { channelId, userId: this.userId });
      webRTCService.closeAllConnections(); 
  }
}

const webSocketService = new WebSocketService();
export default webSocketService;
