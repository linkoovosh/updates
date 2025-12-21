import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { getConversationId } from '../../services/db';
import websocketService from '../../services/websocket';
import { addDmMessage } from '../../store/slices/chatSlice';
import CallStatusPanel from './CallStatusPanel';
import './DmChatView.css';

const DmChatView = () => {
  const dispatch: AppDispatch = useDispatch();
  
  // FIXED SELECTORS
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId);
  const userId = useSelector((state: RootState) => state.auth.userId);
  const dmMessagesStore = useSelector((state: RootState) => state.chat.dmMessages);

  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const conversationId = activeDmConversationId && userId 
    ? getConversationId(userId, activeDmConversationId) 
    : null;

  // Use messages from Redux (server history + live updates)
  const messages = conversationId ? dmMessagesStore[conversationId] || [] : [];
  
  // Fetch history from server
  useEffect(() => {
      if (activeDmConversationId) {
          websocketService.getDmHistory(activeDmConversationId);
      }
  }, [activeDmConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  console.log('DmChatView Rendered. ActiveDM:', activeDmConversationId, 'Msgs:', messages.length);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeDmConversationId || !userId) return;

    const content = message.trim();
    const tempId = `temp-${Date.now()}`;
    const convId = getConversationId(userId, activeDmConversationId);

    // Optimistic UI update
    dispatch(addDmMessage({
        messageId: tempId,
        conversationId: convId,
        senderId: userId,
        recipientId: activeDmConversationId,
        content: content,
        timestamp: Date.now(),
        isSent: false
    } as any));

    websocketService.sendDm(activeDmConversationId, content);
    setMessage('');
  };

  if (!activeDmConversationId || !userId) {
    return (
      <div className="dm-chat-view placeholder">
        <h3>Выберите друга, чтобы начать переписку.</h3>
        <p>Сообщения теперь синхронизируются с сервером.</p>
      </div>
    );
  }

  return (
    <div className="dm-chat-view">
      <CallStatusPanel />
      <div className="dm-messages-list">
        {messages.map((msg) => (
          <div key={msg.messageId} className={`dm-message-wrapper ${msg.senderId === userId ? 'sent' : 'received'}`}>
            <div className="dm-message">
              <p className="dm-message-content">{msg.content}</p>
              <span className="dm-message-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="dm-chat-form" onSubmit={handleSendMessage}>
        <input 
          type="text" 
          placeholder="Написать сообщение..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="dm-chat-input"
        />
        <button type="submit" className="dm-send-button">Отправить</button>
      </form>
    </div>
  );
};

export default DmChatView;