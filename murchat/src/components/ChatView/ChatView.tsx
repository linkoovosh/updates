import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ChatView.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { addMessage, deleteMessage, updateMessage, addDmMessage, clearUnreadCount, togglePinnedMessages } from '../../store/slices/chatSlice';
import { setUserProfileForId } from "../../store/slices/authSlice";
import webSocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from "../../../common/types";
import type { ChannelMessage, SendMessagePayload, Attachment } from "../../../common/types";
import { generateAvatarColor, getInitials } from "../../utils/avatarUtils";
import AudioRecorder from '../AudioRecorder/AudioRecorder';
import VoiceMessagePlayer from '../VoiceMessagePlayer/VoiceMessagePlayer';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import VideoPlayer from './VideoPlayer'; // IMPORT THIS
import ExpressionPicker from './ExpressionPicker';
import MessageContextMenu from './MessageContextMenu';
import PinnedMessages from './PinnedMessages';
import { getConversationId } from '../../services/db';
import { PaperclipIcon, SmileIcon, MicIcon } from '../UI/Icons';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS, hasPermission } from '../../../common/permissions';

const ChatView: React.FC<{ className?: string }> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  
  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId);
  const pinnedMessagesOpen = useSelector((state: RootState) => state.chat.pinnedMessagesOpen);
  
  const allMessages = useSelector((state: RootState) => state.chat.messages);
  const dmMessages = useSelector((state: RootState) => state.chat.dmMessages);
  const channels = useSelector((state: RootState) => state.ui.channels);
  const servers = useSelector((state: RootState) => state.server.servers) || []; // ADDED THIS
  const friends = useSelector((state: RootState) => state.auth.friends);
  const username = useSelector((state: RootState) => state.auth.username);
  const userId = useSelector((state: RootState) => state.auth.userId);
  const currentUserAvatar = useSelector((state: RootState) => state.auth.avatar);
  const serverMembers = useSelector((state: RootState) => state.server.serverMembers);
  const currentServerRoles = useSelector((state: RootState) => state.server.currentServerRoles);
  
  const currentServer = servers.find(s => s.id === selectedServerId);
  const isOwner = currentServer?.ownerId === userId;

  const userPerms = usePermissions(selectedServerId);
  const canManageMessages = isOwner || // OWNER CAN ALWAYS MANAGE
                            hasPermission(userPerms, PERMISSIONS.MANAGE_MESSAGES) || 
                            hasPermission(userPerms, PERMISSIONS.ADMINISTRATOR);

  const isDm = selectedServerId === null && !!activeDmConversationId;
  const effectiveChannelId = isDm ? activeDmConversationId : selectedChannelId;

  const [messageInput, setMessageInput] = useState('');
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: any } | null>(null);
  const [replyingTo, setReplyTo] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<any>(null);

  const handleMicMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowAudioRecorder(true);
    window.addEventListener('mouseup', handleMicMouseUpGlobal);
  };

  const handleMicMouseUpGlobal = () => {
    window.removeEventListener('mouseup', handleMicMouseUpGlobal);
    if (recorderRef.current) {
      recorderRef.current.stopAndSend();
    }
  };

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
          return allMessages.filter((m) => m.channelId === selectedChannelId);
      }
      return [];
  }, [allMessages, dmMessages, selectedChannelId, activeDmConversationId, isDm, userId]);

  const getAuthorColor = (authorId: string, authorName: string) => {
      if (isDm) return 'var(--text-primary)';
      const member = serverMembers.find(m => m.id === authorId);
      if (member && member.roles && member.roles.length > 0) {
          const roles = currentServerRoles
            .filter(r => member.roles.includes(r.id))
            .sort((a,b) => b.position - a.position);
          if (roles.length > 0 && roles[0].color && roles[0].color !== '#000000') return roles[0].color;
      }
      return generateAvatarColor(authorName);
  };

  const groupedMessages = useMemo(() => {
    const groups: any[] = [];
    let currentGroup: any = null;

    messagesForChannel.forEach((msg: any) => {
      const msgId = msg.id || msg.messageId;
      const msgAuthorId = msg.authorId || msg.senderId;
      const hasContent = msg.content || msg.audioData || (msg.attachments && msg.attachments.length > 0);

      if (currentGroup && currentGroup.authorId === msgAuthorId && hasContent) {
        currentGroup.messages.push({ id: msgId, content: msg.content, audioData: msg.audioData, attachments: msg.attachments, isPinned: msg.isPinned });
      } else if (hasContent) {
        const authorName = isDm ? (msg.senderId === userId ? username : channelName) : msg.author;
        groups.push({
          authorId: msgAuthorId,
          author: authorName || 'Unknown',
          authorAvatar: msg.authorAvatar,
          timestamp: new Date(Number(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          messages: [{ id: msgId, content: msg.content, audioData: msg.audioData, attachments: msg.attachments, isPinned: msg.isPinned }],
          authorColor: getAuthorColor(msgAuthorId, authorName || ''),
        });
        currentGroup = groups[groups.length - 1];
      }
    });
    return groups;
  }, [messagesForChannel, serverMembers, currentServerRoles, userId, channelName, username, isDm]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [groupedMessages]);

  const handleSendMessage = (attachments?: Attachment[]) => {
    const content = messageInput.trim();
    if ((content || (attachments && attachments.length > 0)) && effectiveChannelId && userId) {
      if (isDm) {
          webSocketService.sendDm(effectiveChannelId, content, attachments); 
      } else {
          webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, {
              channelId: effectiveChannelId,
              content: content,
              author: username,
              attachments: attachments,
              replyToId: replyingTo?.id
          });
          
          dispatch(addMessage({
              id: `temp-${Date.now()}`,
              channelId: effectiveChannelId,
              content: content,
              author: username || 'Me',
              authorId: userId,
              timestamp: Date.now(),
              authorAvatar: currentUserAvatar || undefined,
              attachments: attachments
          }));
      }
      setMessageInput('');
      setReplyTo(null);
      messageInputRef.current?.focus();
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, message: any) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const handleDeleteMessage = (message: any) => {
      if (confirm('Вы уверены, что хотите удалить это сообщение?')) {
          // Optimistic update
          dispatch(deleteMessage(message.id));
          // Server update
          if (message.id.startsWith('temp-')) return; // Don't delete temp messages on server
          webSocketService.deleteMessage(message.id, effectiveChannelId!);
      }
      setContextMenu(null);
  };

  const handlePinMessage = (message: any) => {
      const type = message.isPinned ? C2S_MSG_TYPE.UNPIN_MESSAGE : C2S_MSG_TYPE.PIN_MESSAGE;
      webSocketService.sendMessage(type as any, { channelId: effectiveChannelId, messageId: message.id });
      setContextMenu(null);
  };

  const handleFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const MAX_SIZE = 2.5 * 1024 * 1024 * 1024; // 2.5 GB
      const newAttachments: Attachment[] = [];
      const token = localStorage.getItem('authToken');

      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          if (file.size > MAX_SIZE) {
              alert(`Файл "${file.name}" слишком велик! Максимальный размер: 2.5 ГБ.`);
              continue;
          }

          // Show a temporary "uploading" state could be good, but for now we just do it
          const formData = new FormData();
          formData.append('file', file);

          try {
              const response = await fetch(`${webSocketService.getServerUrl().replace('wss://', 'https://').replace('ws://', 'http://')}/upload`, {
                  method: 'POST',
                  headers: {
                      'Authorization': `Bearer ${token}`
                  },
                  body: formData
              });

              if (!response.ok) throw new Error('Upload failed');

              const data = await response.json();
              // Server returns { url: '/uploads/filename...' }
              const fullUrl = `${webSocketService.getServerUrl().replace('wss://', 'https://').replace('ws://', 'http://')}${data.url}`;

              newAttachments.push({ 
                  id: crypto.randomUUID(), 
                  url: fullUrl, 
                  filename: file.name, 
                  contentType: file.type, 
                  size: file.size 
              });
          } catch (err) {
              console.error('File upload error:', err);
              alert(`Не удалось загрузить файл "${file.name}"`);
          }
      }
      if (newAttachments.length > 0) handleSendMessage(newAttachments);
  };

  return (
    <div className={`chat-view ${className || ''}`} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} onClick={() => setShowPicker(false)}>
      <div className="chat-header">
        <h2>{isDm ? `@ ${channelName}` : `# ${channelName || 'Выберите канал'}`}</h2>
        <div className="header-actions">
            {!isDm && (
                <button className={`header-btn ${pinnedMessagesOpen ? 'active' : ''}`} title="Закреплённые сообщения" onClick={() => dispatch(togglePinnedMessages())}>
                    <span style={{ fontSize: '1.2rem' }}>📌</span>
                </button>
            )}
        </div>
      </div>

      {pinnedMessagesOpen && <PinnedMessages />}
      
      <div className="message-list">
        {groupedMessages.map((group, gIdx) => (
          <div key={`group-${gIdx}`} className="message-group">
            <div className="message-avatar" style={{ 
                backgroundColor: group.authorAvatar ? 'transparent' : group.authorColor,
                backgroundImage: group.authorAvatar ? `url(${group.authorAvatar})` : 'none',
                backgroundSize: 'cover'
            }} onClick={() => dispatch(setUserProfileForId(group.authorId))}>
              {!group.authorAvatar && getInitials(group.author)}
            </div>
            <div className="message-content-wrapper">
              <div className="message-info">
                <span className="message-author" style={{ color: group.authorColor }}>{group.author}</span>
                <span className="message-time">{group.timestamp}</span>
              </div>
              {group.messages.map((msg: any) => (
                <div key={msg.id} className={`message-item-content ${msg.isPinned ? 'pinned' : ''}`} onContextMenu={(e) => handleMessageContextMenu(e, msg)}>
                    {msg.isPinned && <div className="pinned-indicator">📌 закреплено</div>}
                    {msg.content && <MarkdownRenderer content={msg.content} />}
                    {msg.audioData && <VoiceMessagePlayer src={msg.audioData} />}
                    <div className="message-attachments">
                        {msg.attachments?.map((att: Attachment) => (
                            <div key={att.id} className="attachment-preview">
                                {att.contentType.startsWith('video/') ? (
                                    <VideoPlayer url={att.url} filename={att.filename} />
                                ) : att.contentType.startsWith('image/') ? (
                                    <img src={att.url} alt={att.filename} className="chat-img-attachment" onClick={() => window.open(att.url)} />
                                ) : (
                                    <div className="file-attachment-card">
                                        <span>📄 {att.filename}</span>
                                        <a href={att.url} download={att.filename}>Скачать</a>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area" onClick={e => e.stopPropagation()}>
        {replyingTo && (
            <div className="reply-preview">
                <span className="reply-text">Ответ пользователю <strong>{replyingTo.author}</strong></span>
                <button className="cancel-reply" onClick={() => setReplyTo(null)}>✕</button>
            </div>
        )}
        <div className="chat-input-row">
            <button className="attach-button" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} multiple />
                <PaperclipIcon />
            </button>
            <textarea
                ref={messageInputRef}
                className="chat-textarea"
                placeholder="Напишите сообщение..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                rows={1}
            />
            <div className="input-actions">
                <button className="action-button emoji-button" onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}><SmileIcon /></button>
                <button 
                    className="action-button mic-button" 
                    onMouseDown={handleMicMouseDown}
                >
                    <MicIcon />
                </button>
            </div>
        </div>
        
        {showPicker && (
            <div className="expression-picker-popup" onClick={e => e.stopPropagation()}>
                <ExpressionPicker 
                    onEmojiSelect={(emoji) => {
                        setMessageInput(prev => prev + emoji);
                        messageInputRef.current?.focus();
                    }}
                    onGifSelect={(url) => { handleSendMessage([{ url, filename: 'gif.gif', contentType: 'image/gif', size: 0, id: crypto.randomUUID() }]); setShowPicker(false); }}
                    onStickerSelect={(url) => { handleSendMessage([{ url, filename: 'sticker.png', contentType: 'image/png', size: 0, id: crypto.randomUUID() }]); setShowPicker(false); }}
                    onClose={() => setShowPicker(false)}
                />
            </div>
        )}

        {showAudioRecorder && (
            <div className="audio-recorder-overlay">
                <AudioRecorder 
                    ref={recorderRef}
                    onComplete={(audioData) => {
                        if (isDm && effectiveChannelId) {
                            webSocketService.sendDm(effectiveChannelId, '', undefined, audioData);
                        } else if (effectiveChannelId) {
                            webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, { 
                                channelId: effectiveChannelId, 
                                content: '', 
                                author: username || 'Unknown', 
                                audioData 
                            });
                        }
                        setShowAudioRecorder(false);
                        messageInputRef.current?.focus();
                    }}
                    onCancel={() => setShowAudioRecorder(false)}
                />
            </div>
        )}
      </div>
      
      {contextMenu && (
          <MessageContextMenu 
              position={contextMenu}
              messageId={contextMenu.message.id}
              messageContent={contextMenu.message.content}
              authorId={contextMenu.message.authorId}
              isAuthor={contextMenu.message.authorId === userId}
              canManage={canManageMessages}
              isPinned={!!contextMenu.message.isPinned}
              onClose={() => setContextMenu(null)}
              onEdit={() => {}} // TODO: Implement edit
              onDelete={() => handleDeleteMessage(contextMenu.message)}
              onReply={() => setReplyTo(contextMenu.message)}
              onPin={() => handlePinMessage(contextMenu.message)}
          />
      )}

      {isDragging && <div className="drag-drop-overlay">Отпустите, чтобы отправить файлы 📥</div>}
    </div>
  );
};

export default ChatView;