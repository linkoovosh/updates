import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ChatView.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { addMessage, deleteMessage, updateMessage } from '../../store/slices/chatSlice';
import webSocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from "../../../common/types";
import type { Message, SendMessagePayload, User, Attachment } from "../../../common/types";
import { generateAvatarColor, getInitials } from "../../utils/avatarUtils";
import { setUserProfileForId } from "../../store/slices/authSlice";
import AudioRecorder from '../AudioRecorder/AudioRecorder';
import VoiceMessagePlayer from '../VoiceMessagePlayer/VoiceMessagePlayer';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import MessageContextMenu from './MessageContextMenu';
import UserContextMenu from '../Members/UserContextMenu';
import ExpressionPicker from './ExpressionPicker';

const ChatView: React.FC<{ className?: string }> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId); // NEW
  const allMessages = useSelector((state: RootState) => state.chat.messages);
  const dmMessages = useSelector((state: RootState) => state.chat.dmMessages); // NEW: Access DM messages
  const channels = useSelector((state: RootState) => state.ui.channels);
  const friends = useSelector((state: RootState) => state.auth.friends);
  const username = useSelector((state: RootState) => state.auth.username);
  const userId = useSelector((state: RootState) => state.auth.userId);
  const currentUserAvatar = useSelector((state: RootState) => state.auth.avatar);
  const serverMembers = useSelector((state: RootState) => state.server.serverMembers);
  const currentServerRoles = useSelector((state: RootState) => state.server.currentServerRoles);
  const allTypingUsers = useSelector((state: RootState) => state.chat.typingUsers);
  
  // Determine if we are in a server channel or a DM
  const isDm = !selectedChannelId && !!activeDmConversationId;
  const effectiveChannelId = selectedChannelId || activeDmConversationId;

  const typingUsers = useMemo(() => {
      return allTypingUsers[effectiveChannelId || ''] || [];
  }, [allTypingUsers, effectiveChannelId]);
  
  // ... state ...

  // Auto-resize textarea
  // ...

  // Smarter channel/DM name resolution
  const channelName = useMemo(() => {
    if (!effectiveChannelId) return null;
    const serverChannel = channels.find(c => c.id === effectiveChannelId);
    if (serverChannel) return serverChannel.name;
    const directMessageUser = friends.find(f => f.id === effectiveChannelId);
    if (directMessageUser) return directMessageUser.username;
    return 'Личные сообщения'; // Fallback
  }, [effectiveChannelId, channels, friends]);


  const messagesForChannel = useMemo(() => {
      if (isDm && activeDmConversationId) {
          // Get DM messages for this conversation (key is usually friendId)
          // Actually, key in dmMessages is conversationId (e.g. sorted IDs).
          // We need a helper or just search. Wait, Redux stores by conversationId.
          // Let's find messages where (sender=me AND recipient=friend) OR (sender=friend AND recipient=me).
          // OR better: use the conversationId approach if we have it readily available.
          // Simpler for now: filter allMessages? No, DMs are separate in state.chat.dmMessages.
          
          // Helper to get conversation ID (needs to match what's used in store)
          const ids = [userId, activeDmConversationId].sort();
          const convId = ids.join('-');
          return dmMessages[convId] || []; // Use messages from dmMessages store
      } else {
          return allMessages.filter((message) => message.channelId === selectedChannelId);
      }
  }, [allMessages, dmMessages, selectedChannelId, activeDmConversationId, isDm, userId]);

  const getAuthorColor = (authorId: string, authorName: string) => {
      // Check if we are in a server channel
      const isServerChannel = !!selectedChannelId;
      
      if (isServerChannel) {
  // ...
  
  const groupedMessages = useMemo(() => {
    // ... same logic but use messagesForChannel
    // ...
  }, [messagesForChannel, serverMembers, currentServerRoles, effectiveChannelId]); // Updated dep

  // ... scroll effect ...

  // --- NEW: Load History & Mark Read ---
  useEffect(() => {
      if (effectiveChannelId) {
          if (!isDm) {
              // It's a server channel
              webSocketService.getChannelMessages(effectiveChannelId);
              webSocketService.markChannelRead(effectiveChannelId);
          } else {
              // It's a DM, load DM history
              webSocketService.getDmHistory(effectiveChannelId);
          }
      }
  }, [effectiveChannelId, isDm]); // Re-run when effective channel changes

  // Mark read when new messages arrive
  useEffect(() => {
      if (effectiveChannelId && messagesForChannel.length > 0) {
          if (!isDm) {
               webSocketService.markChannelRead(effectiveChannelId);
          }
      }
  }, [messagesForChannel.length, effectiveChannelId, isDm]); 

  const handleSendMessage = (attachments?: Attachment[]) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    webSocketService.sendTypingStop(effectiveChannelId || '');
    
    const content = messageInput.trim();
    if ((content || (attachments && attachments.length > 0)) && effectiveChannelId && username && userId) {
      // Optimistic Update
      const tempId = `temp-${Date.now()}`;
                const optimisticMessage: Message = {
                id: tempId,
                channelId: effectiveChannelId,
                          content: content,
                          author: username,
                          authorId: userId,
                          timestamp: Date.now(),
                          authorAvatar: currentUserAvatar || undefined,
                          attachments: attachments,
                          replyToId: replyTo?.id
            };
            
            // Dispatch locally immediately
            if (isDm) {
                // Manually construct IDmMessage for local display if needed, or rely on WS echo?
                // Better to rely on WS echo for DMs to ensure sync, or add special action.
                // But wait, chatSlice has addDmMessage. Let's use it.
                const ids = [userId, effectiveChannelId].sort();
                const convId = ids.join('-');
                dispatch(addDmMessage({
                    messageId: tempId,
                    conversationId: convId,
                    senderId: userId,
                    recipientId: effectiveChannelId,
                    content: content,
                    timestamp: Date.now(),
                    isSent: false // pending
                } as any));
            } else {
                dispatch(addMessage(optimisticMessage));
            }
      
            if (isDm) {
                webSocketService.sendDm(effectiveChannelId, content, attachments); 
            } else {
                const messagePayload: SendMessagePayload = {
                  channelId: effectiveChannelId,
                  content: content,
                  author: username,
                  attachments: attachments,
                  replyToId: replyTo?.id
                };
                console.log('[ChatView] Sending message:', messagePayload);
                webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, messagePayload);
            }
// ...
                  onChange={(e) => {
                      setMessageInput(e.target.value);
                      if (effectiveChannelId) {
                          webSocketService.sendTypingStart(effectiveChannelId);
                          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                          typingTimeoutRef.current = setTimeout(() => {
                              webSocketService.sendTypingStop(effectiveChannelId);
                          }, 2000);
                      }
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  disabled={!effectiveChannelId}
// ...
                <button 
                    className="toggle-audio-input-button"
                    onClick={() => effectiveChannelId && setShowAudioRecorder(true)}
                    disabled={!effectiveChannelId}
                    title="Записать голосовое сообщение"
                >
// ...