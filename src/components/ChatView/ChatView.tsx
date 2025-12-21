import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ChatView.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { addMessage, deleteMessage, updateMessage, addDmMessage } from '../../store/slices/chatSlice';
import webSocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from "../../../common/types";
import type { Message, SendMessagePayload, Attachment } from "../../../common/types";
import { generateAvatarColor, getInitials } from "../../utils/avatarUtils";
import { setUserProfileForId } from "../../store/slices/authSlice";
import AudioRecorder from '../AudioRecorder/AudioRecorder';
import VoiceMessagePlayer from '../VoiceMessagePlayer/VoiceMessagePlayer';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import MessageContextMenu from './MessageContextMenu';
import UserContextMenu from '../Members/UserContextMenu';
import ExpressionPicker from './ExpressionPicker';
import { getConversationId } from '../../services/db';

const ChatView: React.FC<{ className?: string }> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  
  // SELECTORS
  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId);
  
  const allMessages = useSelector((state: RootState) => state.chat.messages);
  const dmMessages = useSelector((state: RootState) => state.chat.dmMessages);
  const channels = useSelector((state: RootState) => state.ui.channels);
  const friends = useSelector((state: RootState) => state.auth.friends);
  const username = useSelector((state: RootState) => state.auth.username);
  const userId = useSelector((state: RootState) => state.auth.userId);
  const currentUserAvatar = useSelector((state: RootState) => state.auth.avatar);
  const serverMembers = useSelector((state: RootState) => state.server.serverMembers);
  const currentServerRoles = useSelector((state: RootState) => state.server.currentServerRoles);
  const allTypingUsers = useSelector((state: RootState) => state.chat.typingUsers);
  
  // CRITICAL: Determine mode based on selectedServerId
  const isDm = selectedServerId === null && !!activeDmConversationId;
  const effectiveChannelId = isDm ? activeDmConversationId : selectedChannelId;

  const typingUsers = useMemo(() => {
      return allTypingUsers[effectiveChannelId || ''] || [];
  }, [allTypingUsers, effectiveChannelId]);
  
  const [messageInput, setMessageInput] = useState('');
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message | null } | null>(null);
  const [userContextMenu, setUserContextMenu] = useState<{ x: number; y: number; user: any } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
      messageInputRef.current.style.height = `${Math.min(messageInputRef.current.scrollHeight, 200)}px`;
    }
  }, [messageInput]);

  const channelName = useMemo(() => {
    if (!effectiveChannelId) return null;
    if (!isDm) {
        const serverChannel = channels.find(c => c.id === effectiveChannelId);
        return serverChannel ? serverChannel.name : 'Канал';
    } else {
        const directMessageUser = friends.find(f => f.id === effectiveChannelId);
        return directMessageUser ? directMessageUser.username : 'Личные сообщения';
    }
  }, [effectiveChannelId, isDm, channels, friends]);


  const messagesForChannel = useMemo(() => {
      if (isDm && activeDmConversationId && userId) {
          const convId = getConversationId(userId, activeDmConversationId);
          return dmMessages[convId] || [];
      } else if (selectedChannelId) {
          return allMessages.filter((message) => message.channelId === selectedChannelId);
      }
      return [];
  }, [allMessages, dmMessages, selectedChannelId, activeDmConversationId, isDm, userId]);

  const getAuthorColor = (authorId: string, authorName: string) => {
      if (!isDm && selectedChannelId) {
          const member = serverMembers.find(m => m.id === authorId);
          if (member && member.roles && member.roles.length > 0) {
              const memberRoles = currentServerRoles.filter(r => member.roles.includes(r.id));
              memberRoles.sort((a, b) => b.position - a.position);
              if (memberRoles.length > 0) return memberRoles[0].color;
          }
      }
      return generateAvatarColor(authorName);
  };

  const groupedMessages = useMemo(() => {
    const groups: {
      authorId: string;
      author: string;
      authorAvatar?: string;
      timestamp: string;
      messages: { id: string; content: string; audioData?: string; attachments?: Attachment[] }[];
      authorColor: string;
    }[] = [];

    let currentGroup: typeof groups[0] | null = null;

    messagesForChannel.forEach((msg: any) => {
      // DMs use .messageId, Server use .id. Let's normalize.
      const msgId = msg.id || msg.messageId;
      const hasContent = (msg.content && msg.content.trim()) || msg.audioData || (msg.attachments && msg.attachments.length > 0);
      const msgAuthorId = msg.authorId || msg.senderId;

      if (currentGroup && (currentGroup.authorId === msgAuthorId) && hasContent) {
        currentGroup.messages.push({ 
            id: msgId, 
            content: msg.content, 
            audioData: msg.audioData,
            attachments: msg.attachments 
        });
      } else if (hasContent) {
        // BETTER AUTHOR NAME RESOLUTION FOR DMs
        let safeAuthorName = msg.author;
        if (isDm) {
            if (msg.senderId === userId) {
                safeAuthorName = username || 'Me';
            } else {
                safeAuthorName = channelName || 'Friend';
            }
        }
        if (!safeAuthorName) safeAuthorName = 'Unknown';

        const authorId = msg.authorId || msg.senderId;
        groups.push({
          authorId: authorId,
          author: safeAuthorName,
          authorAvatar: msg.authorAvatar,
          timestamp: new Date(Number(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          messages: [{ 
              id: msgId, 
              content: msg.content, 
              audioData: msg.audioData,
              attachments: msg.attachments 
          }],
          authorColor: getAuthorColor(authorId, safeAuthorName),
        });
        currentGroup = groups[groups.length - 1];
      }
    });
    return groups;
  }, [messagesForChannel, serverMembers, currentServerRoles, effectiveChannelId, userId, channelName, username, isDm]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupedMessages]);

  useEffect(() => {
      if (effectiveChannelId) {
          if (!isDm) {
              webSocketService.getChannelMessages(effectiveChannelId);
              webSocketService.markChannelRead(effectiveChannelId);
          } else {
              webSocketService.getDmHistory(effectiveChannelId);
          }
      }
  }, [effectiveChannelId, isDm]);

  const handleSendMessage = (attachments?: Attachment[]) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    webSocketService.sendTypingStop(effectiveChannelId || '');
    
    const content = messageInput.trim();
    if ((content || (attachments && attachments.length > 0)) && effectiveChannelId && username && userId) {
      const tempId = `temp-${Date.now()}`;
      
      if (isDm) {
          const convId = getConversationId(userId, effectiveChannelId);
          dispatch(addDmMessage({
              messageId: tempId,
              conversationId: convId,
              senderId: userId,
              recipientId: effectiveChannelId,
              content: content,
              timestamp: Date.now(),
              isSent: false
          } as any));
          webSocketService.sendDm(effectiveChannelId, content, attachments); 
      } else {
          dispatch(addMessage({
              id: tempId,
              channelId: effectiveChannelId,
              content: content,
              author: username,
              authorId: userId,
              timestamp: Date.now(),
              authorAvatar: currentUserAvatar || undefined,
              attachments: attachments,
              replyToId: replyTo?.id
          }));
          webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, {
              channelId: effectiveChannelId,
              content: content,
              author: username,
              attachments: attachments,
              replyToId: replyTo?.id
          });
      }
      setMessageInput('');
      setReplyTo(null);
      messageInputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --- Upload / DnD / Paste Handlers (Skipped for brevity, remain same) ---
  const handleFiles = async (files: FileList | null) => { /* ... existing logic ... */ };
  const handlePaste = (e: React.ClipboardEvent) => { /* ... existing logic ... */ };
  const handleDrop = (e: React.DragEvent) => { /* ... existing logic ... */ };

  return (
    <div className={`chat-view ${className || ''}`} ref={chatContainerRef} onClick={() => setShowPicker(false)}>
      <div className="chat-header">
        <h2>{isDm ? `@ ${channelName}` : `# ${channelName || 'Выберите канал'}`}</h2>
      </div>
      <div className="message-list">
        {groupedMessages.map((group, gIdx) => (
          <div key={`group-${group.authorId}-${gIdx}`} className="message-group">
            <div className="message-avatar" style={{ 
                backgroundColor: group.authorAvatar ? 'transparent' : group.authorColor,
                backgroundImage: group.authorAvatar ? `url(${group.authorAvatar})` : 'none',
                backgroundSize: 'cover'
            }} onClick={() => handleAuthorClick(group.authorId)}>
              {!group.authorAvatar && getInitials(group.author)}
            </div>
            <div className="message-content-wrapper">
              <div className="message-info">
                <span className="message-author" style={{ color: group.authorColor }}>{group.author}</span>
                <span className="message-time">{group.timestamp}</span>
              </div>
              {group.messages.map((msg) => (
                <div key={msg.id} className="message-item-content">
                    {msg.content && <MarkdownRenderer content={msg.content} />}
                    {msg.audioData && <VoiceMessagePlayer src={msg.audioData} />}
                    {/* Attachments rendering logic... */}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {!effectiveChannelId ? (
          <div className="chat-input-disabled">Выберите собеседника</div>
      ) : (
          <div className="chat-input">
            <div className="chat-input-row">
                <textarea
                  ref={messageInputRef}
                  placeholder={`Написать ${isDm ? channelName : '#' + channelName}`}
                  value={messageInput}
                  onChange={(e) => {
                      setMessageInput(e.target.value);
                      if (effectiveChannelId) webSocketService.sendTypingStart(effectiveChannelId);
                  }}
                  onKeyDown={handleKeyDown}
                  className="chat-textarea"
                  rows={1}
                />
            </div>
          </div>
      )}
    </div>
  );
};

// Helper inside component or imported
const handleAuthorClick = (id: string) => { /* ... */ };

export default ChatView;