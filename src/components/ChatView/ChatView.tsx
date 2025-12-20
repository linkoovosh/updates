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
  const allMessages = useSelector((state: RootState) => state.chat.messages);
  const channels = useSelector((state: RootState) => state.ui.channels);
  const friends = useSelector((state: RootState) => state.auth.friends);
  const username = useSelector((state: RootState) => state.auth.username);
  const userId = useSelector((state: RootState) => state.auth.userId);
  const currentUserAvatar = useSelector((state: RootState) => state.auth.avatar);
  const serverMembers = useSelector((state: RootState) => state.server.serverMembers);
  const currentServerRoles = useSelector((state: RootState) => state.server.currentServerRoles);
  const allTypingUsers = useSelector((state: RootState) => state.chat.typingUsers);
  
  const typingUsers = useMemo(() => {
      return allTypingUsers[selectedChannelId || ''] || [];
  }, [allTypingUsers, selectedChannelId]);
  
  const [messageInput, setMessageInput] = useState('');
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false); // NEW
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message | null } | null>(null);
  const [userContextMenu, setUserContextMenu] = useState<{ x: number; y: number; user: any } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null); // NEW: Reply state
  const [editContent, setEditContent] = useState(''); // NEW
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // NEW

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

  // Smarter channel/DM name resolution
  const channelName = useMemo(() => {
    if (!selectedChannelId) return null;
    const serverChannel = channels.find(c => c.id === selectedChannelId);
    if (serverChannel) return serverChannel.name;
    const directMessageUser = friends.find(f => f.id === selectedChannelId);
    if (directMessageUser) return directMessageUser.username;
    return selectedChannelId; // Fallback to ID
  }, [selectedChannelId, channels, friends]);


  const messagesForChannel = allMessages.filter(
    (message) => message.channelId === selectedChannelId
  );

  const getAuthorColor = (authorId: string, authorName: string) => {
      // Check if we are in a server channel
      const isServerChannel = channels.some(c => c.id === selectedChannelId);
      
      if (isServerChannel) {
          const member = serverMembers.find(m => m.id === authorId);
          if (member && member.roles && member.roles.length > 0) {
              // Find all roles for this member
              const memberRoles = currentServerRoles.filter(r => member.roles.includes(r.id));
              // Sort by position (descending)
              memberRoles.sort((a, b) => b.position - a.position);
              
              // Return color of the highest role that has a color (and is not default gray if desired, but assumption is role has color)
              // Assuming all roles have a color, or we skip default ones if needed.
              // For now, take top role's color.
              if (memberRoles.length > 0) {
                  return memberRoles[0].color;
              }
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

    messagesForChannel.forEach((message) => {
      const hasContent = message.content.trim() || message.audioData || (message.attachments && message.attachments.length > 0);

      if (currentGroup && currentGroup.author === message.author && hasContent) {
        currentGroup.messages.push({ 
            id: message.id, 
            content: message.content, 
            audioData: message.audioData,
            attachments: message.attachments 
        });
      } else if (hasContent) {
        const safeAuthorName = message.author || 'Unknown';
        currentGroup = {
          authorId: message.authorId,
          author: safeAuthorName,
          authorAvatar: message.authorAvatar,
          timestamp: new Date(Number(message.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          messages: [{ 
              id: message.id, 
              content: message.content, 
              audioData: message.audioData,
              attachments: message.attachments 
          }],
          authorColor: getAuthorColor(message.authorId, safeAuthorName),
        };
        groups.push(currentGroup);
      }
    });
    return groups;
  }, [messagesForChannel, serverMembers, currentServerRoles, selectedChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupedMessages]);

  // --- NEW: Load History & Mark Read ---
  useEffect(() => {
      if (selectedChannelId) {
          const isDm = friends.some(f => f.id === selectedChannelId);
          if (!isDm) {
              // It's a server channel
              webSocketService.getChannelMessages(selectedChannelId);
              webSocketService.markChannelRead(selectedChannelId);
          } else {
              // It's a DM, load DM history
              webSocketService.getDmHistory(selectedChannelId);
          }
      }
  }, [selectedChannelId, friends]); // Re-run when channel changes

  // Mark read when new messages arrive in current channel
  useEffect(() => {
      if (selectedChannelId && messagesForChannel.length > 0) {
          const isDm = friends.some(f => f.id === selectedChannelId);
          if (!isDm) {
               // Debounce this if needed, but for now simple call is okay
               webSocketService.markChannelRead(selectedChannelId);
          }
      }
  }, [messagesForChannel.length, selectedChannelId, friends]); 



// ... inside component ...

  const handleSendMessage = (attachments?: Attachment[]) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    webSocketService.sendTypingStop(selectedChannelId || '');
    
    const content = messageInput.trim();
    if ((content || (attachments && attachments.length > 0)) && selectedChannelId && username && userId) {
      // Optimistic Update
      const tempId = `temp-${Date.now()}`;
                const optimisticMessage: Message = {
                id: tempId,
                channelId: selectedChannelId,
                          content: content,
                          author: username,
                          authorId: userId,
                          timestamp: Date.now(),
                          authorAvatar: currentUserAvatar || undefined,
                          attachments: attachments,
                          replyToId: replyTo?.id // Include reply ID
            };
            
            // Dispatch locally immediately
            dispatch(addMessage(optimisticMessage));
      
            // Check if it's a DM (friend ID) or Server Channel
            const isDm = friends.some(f => f.id === selectedChannelId);
      
            if (isDm) {
                // DMs don't support replies in this payload structure yet, but we pass it anyway if needed or ignore
                webSocketService.sendDm(selectedChannelId, content, attachments); 
            } else {
                const messagePayload: SendMessagePayload = {
                  channelId: selectedChannelId,
                  content: content,
                  author: username,
                  attachments: attachments,
                  replyToId: replyTo?.id // Include reply ID
                };
                console.log('[ChatView] Sending message:', messagePayload);
                webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, messagePayload);
            }
            setMessageInput('');
            setReplyTo(null); // Clear reply
            messageInputRef.current?.focus();
          }
        };
      
        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
          }
        };
  // --- FILE UPLOAD LOGIC ---
  const uploadFile = async (file: File): Promise<Attachment | null> => {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('authToken');

      try {
          const headers: HeadersInit = {};
          if (token) {
              headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch('https://89.221.20.26:22822/upload', {
              method: 'POST',
              headers: headers,
              body: formData,
          });

          if (!response.ok) {
              throw new Error('Upload failed');
          }

          const data = await response.json();
          // Construct full URL if server returns relative path
          const fullUrl = data.url.startsWith('http') ? data.url : `https://89.221.20.26:22822${data.url}`;
          
          return {
              id: Date.now().toString(), // Temp ID
              url: fullUrl,
              filename: data.originalName || file.name,
              contentType: data.mimetype || file.type,
              size: data.size || file.size
          };
      } catch (error) {
          console.error('File upload error:', error);
          alert('Failed to upload file.');
          return null;
      } finally {
          setIsUploading(false);
      }
  };

  const handleFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      
      const attachments: Attachment[] = [];
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const attachment = await uploadFile(file);
          if (attachment) {
              attachments.push(attachment);
          }
      }

      if (attachments.length > 0) {
          handleSendMessage(attachments);
      }
  };

  // --- DRAG & DROP HANDLERS ---
  const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null || (chatContainerRef.current && !chatContainerRef.current.contains(e.relatedTarget as Node))) {
        setIsDragging(false);
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFiles(e.dataTransfer.files);
      }
  };

  // --- PASTE HANDLER ---
  const handlePaste = (e: React.ClipboardEvent) => {
      if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault(); // Prevent pasting the file name as text
          handleFiles(e.clipboardData.files);
      }
  };


  const handleAudioRecordingComplete = (audioBlob: Blob, duration: number) => {
    console.log(`ChatView: Recording complete, duration: ${duration}s. Blob:`, audioBlob);
    setShowAudioRecorder(false);
    if (!selectedChannelId || !username) return;

    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Audio = reader.result as string;
        console.log('ChatView: Base64 audio ready, length:', base64Audio.length);
        
        if (selectedChannelId && username && userId) {
             const tempId = `temp-${Date.now()}`;
             const optimisticMessage: Message = {
                id: tempId,
                channelId: selectedChannelId,
                content: `[Голосовое сообщение ${duration}с]`,
                author: username,
                authorId: userId,
                timestamp: Date.now(),
                authorAvatar: currentUserAvatar || undefined,
                audioData: base64Audio
            };
            dispatch(addMessage(optimisticMessage));
        }

        const payload: SendMessagePayload = {
            channelId: selectedChannelId,
            content: `[Голосовое сообщение ${duration}с]`,
            author: username,
            audioData: base64Audio
        };
        webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, payload);
        messageInputRef.current?.focus(); // Restore focus
    };
    reader.readAsDataURL(audioBlob);
  };

  const handleAudioRecordingCancel = () => {
    console.log('ChatView: Recording cancelled.');
    setShowAudioRecorder(false);
    messageInputRef.current?.focus(); // Restore focus
  };

  const handleAuthorClick = (authorId: string) => {
    dispatch(setUserProfileForId(authorId));
  };

  const handleUserContextMenu = (e: React.MouseEvent, authorId: string, authorName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const user = serverMembers.find(m => m.id === authorId) || { id: authorId, username: authorName, discriminator: '0000', avatar: null, status: 'offline' };
      setUserContextMenu({ x: e.clientX, y: e.clientY, user });
  };

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const handleDeleteMessage = (messageId: string) => {
      if (confirm('Вы уверены, что хотите удалить это сообщение?')) {
          dispatch(deleteMessage(messageId)); // Optimistic delete
          if (!messageId.startsWith('temp-')) {
            webSocketService.deleteMessage(messageId, selectedChannelId || '');
          }
          if (editingMessageId === messageId) {
              setEditingMessageId(null);
              setEditContent('');
          }
          setTimeout(() => messageInputRef.current?.focus(), 10);
      }
  };

  const startEditing = (message: Message) => {
      setEditingMessageId(message.id);
      setEditContent(message.content);
  };

  const saveEdit = (messageId: string) => {
      if (editContent.trim()) {
          dispatch(updateMessage({ messageId, content: editContent.trim() })); // Optimistic update
          if (!messageId.startsWith('temp-')) {
            webSocketService.editMessage(messageId, selectedChannelId || '', editContent.trim());
          }
          setEditingMessageId(null);
          setEditContent('');
      }
  };

  const cancelEdit = () => {
      setEditingMessageId(null);
      setEditContent('');
  };

  const handleEmojiSelect = (emoji: string) => {
      setMessageInput(prev => prev + emoji);
  };

    const handleGifStickerSelect = (url: string) => {
        const attachment: Attachment = {
            id: Date.now().toString(),
            url: url,
            filename: 'sticker.png', // Generic name
            contentType: 'image/png',
            size: 0
        };
        // Send immediately
        handleSendMessage([attachment]);
        setShowPicker(false);
    };
  
    const handleStickerUploadWrapper = async (file: File): Promise<string | null> => {
        const attachment = await uploadFile(file);
        return attachment ? attachment.url : null;
    };
  
    return (
      <div 
          className={`chat-view ${className || ''}`} 
          ref={chatContainerRef}        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => { setContextMenu(null); setUserContextMenu(null); setShowPicker(false); }}
    >
      {contextMenu && contextMenu.message && (
          <MessageContextMenu 
              position={contextMenu} 
              messageId={contextMenu.message.id} 
              messageContent={contextMenu.message.content}
              authorId={contextMenu.message.authorId}
              isAuthor={contextMenu.message.authorId === userId} // Check authorship
              onClose={() => setContextMenu(null)}
              onEdit={() => startEditing(contextMenu.message!)}
              onDelete={() => handleDeleteMessage(contextMenu.message!.id)}
              onReply={() => { setReplyTo(contextMenu.message); messageInputRef.current?.focus(); }}
          />
      )}

      {userContextMenu && (
          <UserContextMenu
              position={userContextMenu}
              user={userContextMenu.user}
              onClose={() => setUserContextMenu(null)}
          />
      )}

      {/* Drag Overlay */}
      {isDragging && (
          <div className="drag-overlay">
              <div className="drag-content">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <h3>Drop files to upload</h3>
              </div>
          </div>
      )}

      {/* Uploading Indicator */}
      {isUploading && (
          <div className="uploading-indicator">
              <span>Uploading...</span>
          </div>
      )}

      <div className="chat-header">
        <h2># {channelName || 'Выберите канал'}</h2>
      </div>
      <div className="message-list">
        {groupedMessages.map((group, index) => (
          <div 
            key={group.messages[0].id || index} 
            className="message-group"
            style={{ 
                animation: 'cascade-fade 0.4s ease-out both', 
                animationDelay: `${Math.min(index * 0.05, 1)}s` 
            }}
          >
            <div
              className="message-avatar"
              onClick={() => handleAuthorClick(group.authorId)}
              onContextMenu={(e) => handleUserContextMenu(e, group.authorId, group.author)}
              style={{ 
                  backgroundColor: group.authorAvatar ? 'transparent' : group.authorColor,
                  backgroundImage: group.authorAvatar ? `url(${group.authorAvatar})` : 'none',
                  backgroundSize: 'cover'
              }}
            >
              {!group.authorAvatar && getInitials(group.author)}
            </div>
            <div className="message-content-wrapper">
              <div className="message-info">
                <span 
                    className="message-author" 
                    onClick={() => handleAuthorClick(group.authorId)} 
                    onContextMenu={(e) => handleUserContextMenu(e, group.authorId, group.author)}
                    style={{ color: group.authorColor }}
                >
                    {group.author}
                </span>
                <span className="message-time">{group.timestamp}</span>
              </div>
              {group.messages.map((msg) => (
                <div 
                    key={msg.id} 
                    className={`message-item-content ${editingMessageId === msg.id ? 'editing' : ''}`}
                    onContextMenu={(e) => handleMessageContextMenu(e, { ...msg, author: group.author, authorId: group.authorId, timestamp: group.timestamp, channelId: selectedChannelId || '' } as Message)} // Reconstruct message object for menu
                >
                    {editingMessageId === msg.id ? (
                        <div className="edit-message-box">
                            <input 
                                value={editContent} 
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit(msg.id);
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                                autoFocus
                            />
                            <div className="edit-hints">Enter - сохранить, Esc - отмена</div>
                        </div>
                    ) : (
                        <>
                            {/* Render Text (Markdown) */}
                            {msg.content && <MarkdownRenderer content={msg.content} />}
                            
                            {/* Render Audio */}
                            {msg.audioData && <VoiceMessagePlayer src={msg.audioData} />}
                            
                            {/* Render Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                                <div className="message-attachments">
                                    {msg.attachments.map((att, i) => (
                                        <div key={i} className="attachment-item">
                                            {att.contentType.startsWith('image/') ? (
                                                <div className="image-attachment-wrapper">
                                                    <img 
                                                        src={att.url} 
                                                        alt={att.filename} 
                                                        className="message-image" 
                                                        onClick={() => window.open(att.url, '_blank')}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="file-attachment">
                                                    <div className="file-icon">
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                                    </div>
                                                    <div className="file-info">
                                                        <div className="file-name">{att.filename}</div>
                                                        <div className="file-size">{(att.size / 1024).toFixed(1)} KB</div>
                                                    </div>
                                                    <a href={att.url} download target="_blank" rel="noopener noreferrer" className="download-btn">
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {groupedMessages.length === 0 && (
          <p className="no-messages">
            Нет сообщений в канале #{channelName}.
          </p>
        )}
        <div ref={messagesEndRef} />
        
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
            <div className="typing-indicator" style={{ 
                padding: '0 16px', 
                fontSize: '12px', 
                color: 'var(--text-tertiary)', 
                marginBottom: '4px',
                fontWeight: 'bold',
                animation: 'pulse 1.5s infinite'
            }}>
                {typingUsers.length > 3 
                    ? 'Несколько пользователей печатают...' 
                    : `${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'печатает...' : 'печатают...'}`
                }
            </div>
        )}
      </div>
      <div className="chat-input" onClick={(e) => e.stopPropagation()}>
        {replyTo && (
            <div className="reply-bar">
                <span className="reply-info">
                    Ответ <span className="reply-author">{replyTo.author}</span>
                </span>
                <button className="cancel-reply-btn" onClick={() => setReplyTo(null)}>✕</button>
            </div>
        )}
        
        {showAudioRecorder ? (
            <div className="chat-input-row">
                <AudioRecorder
                    onRecordingComplete={handleAudioRecordingComplete}
                    onCancel={handleAudioRecordingCancel}
                    isRecording={isRecording}
                    setIsRecording={setIsRecording}
                />
            </div>
        ) : (
            <div className="chat-input-row">
                {showPicker && (
                    <ExpressionPicker 
                        onEmojiSelect={handleEmojiSelect}
                        onGifSelect={handleGifStickerSelect}
                        onStickerSelect={handleGifStickerSelect}
                        onUploadSticker={handleStickerUploadWrapper}
                        onClose={() => setShowPicker(false)}
                    />
                )}

                <button 
                    className="attachment-button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedChannelId || isUploading}
                    title="Прикрепить файл"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={(e) => handleFiles(e.target.files)} 
                    multiple
                />

                <button 
                    className="emoji-button"
                    onClick={() => setShowPicker(!showPicker)}
                    title="Эмодзи, стикеры и GIF"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                </button>

                <textarea
                  ref={messageInputRef}
                  id="chat-message-input"
                  placeholder={`Сообщение #${channelName || 'канал'}`}
                  value={messageInput}
                  onChange={(e) => {
                      setMessageInput(e.target.value);
                      if (selectedChannelId) {
                          webSocketService.sendTypingStart(selectedChannelId);
                          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                          typingTimeoutRef.current = setTimeout(() => {
                              webSocketService.sendTypingStop(selectedChannelId);
                          }, 2000);
                      }
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  disabled={!selectedChannelId}
                  rows={1}
                  className="chat-textarea"
                />
                
                <button 
                    className="toggle-audio-input-button"
                    onClick={() => selectedChannelId && setShowAudioRecorder(true)}
                    disabled={!selectedChannelId}
                    title="Записать голосовое сообщение"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default ChatView;