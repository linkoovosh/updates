import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ChatView.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { addMessage, deleteMessage, updateMessage, addDmMessage, clearUnreadCount } from '../../store/slices/chatSlice';
import { setUserProfileForId } from "../../store/slices/authSlice";
import webSocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from "../../../common/types";
import type { ChannelMessage, SendMessagePayload, Attachment } from "../../../common/types";
import { generateAvatarColor, getInitials } from "../../utils/avatarUtils";
import AudioRecorder from '../AudioRecorder/AudioRecorder';
import VoiceMessagePlayer from '../VoiceMessagePlayer/VoiceMessagePlayer';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import ExpressionPicker from './ExpressionPicker';
import { getConversationId } from '../../services/db';
import { PaperclipIcon, SmileIcon, MicIcon } from '../UI/Icons';

const ChatView: React.FC<{ className?: string }> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  
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
  
  const isDm = selectedServerId === null && !!activeDmConversationId;
  const effectiveChannelId = isDm ? activeDmConversationId : selectedChannelId;

  const [messageInput, setMessageInput] = useState('');
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

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
      const member = serverMembers.find(m => m.id === authorId);
      if (member && member.roles?.length > 0) {
          const roles = currentServerRoles.filter(r => member.roles.includes(r.id)).sort((a,b) => b.position - a.position);
          if (roles.length > 0) return roles[0].color;
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
        currentGroup.messages.push({ id: msgId, content: msg.content, audioData: msg.audioData, attachments: msg.attachments });
      } else if (hasContent) {
        const authorName = isDm ? (msg.senderId === userId ? username : channelName) : msg.author;
        groups.push({
          authorId: msgAuthorId,
          author: authorName || 'Unknown',
          authorAvatar: msg.authorAvatar,
          timestamp: new Date(Number(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          messages: [{ id: msgId, content: msg.content, audioData: msg.audioData, attachments: msg.attachments }],
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
          // websocketService.sendDm already handles optimistic update for DMs internally!
          webSocketService.sendDm(effectiveChannelId, content, attachments); 
      } else {
          webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, {
              channelId: effectiveChannelId,
              content: content,
              author: username,
              attachments: attachments
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
      messageInputRef.current?.focus();
    }
  };

  const handleFiles = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const newAttachments: Attachment[] = [];
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
          });
          newAttachments.push({ id: crypto.randomUUID(), url: base64, filename: file.name, contentType: file.type, size: file.size });
      }
      handleSendMessage(newAttachments);
  };

  return (
    <div className={`chat-view ${className || ''}`} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} onClick={() => setShowPicker(false)}>
      <div className="chat-header">
        <h2>{isDm ? `@ ${channelName}` : `# ${channelName || 'Выберите канал'}`}</h2>
      </div>
      
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
                <div key={msg.id} className="message-item-content">
                    {msg.content && <MarkdownRenderer content={msg.content} />}
                    {msg.audioData && <VoiceMessagePlayer src={msg.audioData} />}
                    <div className="message-attachments">
                        {msg.attachments?.map((att: Attachment) => (
                            <div key={att.id} className="attachment-preview">
                                {att.contentType.startsWith('image/') ? (
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
                onChange={(e) => {
                    setMessageInput(e.target.value);
                    if (effectiveChannelId) webSocketService.sendTypingStart(effectiveChannelId);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                rows={1}
            />
            <div className="input-actions">
                <button className="action-button emoji-button" onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}><SmileIcon /></button>
                <button className="action-button mic-button" onClick={() => setShowAudioRecorder(true)}><MicIcon /></button>
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
                    onComplete={(audioData) => {
                        webSocketService.sendMessage(C2S_MSG_TYPE.SEND_MESSAGE, { channelId: effectiveChannelId, content: '', author: username, audioData });
                        setShowAudioRecorder(false);
                    }}
                    onCancel={() => setShowAudioRecorder(false)}
                />
            </div>
        )}
      </div>
      {isDragging && <div className="drag-drop-overlay">Отпустите, чтобы отправить файлы 📥</div>}
    </div>
  );
};

export default ChatView;