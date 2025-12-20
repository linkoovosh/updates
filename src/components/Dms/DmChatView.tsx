import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RootState } from '../../store';
import { db, getConversationId } from '../../services/db';
import websocketService from '../../services/websocket';
import CallStatusPanel from './CallStatusPanel';
import './DmChatView.css';

const DmChatView = () => {
  const { activeDmConversationId, userId } = useSelector((state: RootState) => ({
    activeDmConversationId: state.ui.activeDmConversationId,
    userId: state.ui.userId,
  }));

  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const conversationId = activeDmConversationId && userId 
    ? getConversationId(userId, activeDmConversationId) 
    : null;

  const dmMessagesFromRedux = useSelector((state: RootState) => 
    conversationId ? state.ui.dmMessages[conversationId] || [] : []
  );

  const dmMessagesFromDb = useLiveQuery(
    () => conversationId 
      ? db.dmMessages.where('conversationId').equals(conversationId).sortBy('timestamp')
      : Promise.resolve([]),
    [conversationId]
  );
  
  // Prefer Redux messages if available (since we now sync history to Redux), fallback to DB if Redux empty (rare case if sync works), or empty array.
  // Actually, since we push history to Redux, Redux should be the source of truth for the session.
  const messages = dmMessagesFromRedux.length > 0 ? dmMessagesFromRedux : (dmMessagesFromDb || []);
  
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

  console.log('DmChatView Rendered. ActiveDM:', activeDmConversationId); // DEBUG LOG

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeDmConversationId) return;

    websocketService.sendDm(activeDmConversationId, message.trim());
    setMessage('');
  };

  if (!activeDmConversationId || !userId) {
    return (
      <div className="dm-chat-view placeholder">
        <h3>Выберите друга, чтобы начать переписку.</h3>
        <p>Ваши сообщения будут храниться локально на этом устройстве.</p>
      </div>
    );
  }

  return (
    <div className="dm-chat-view">
      <CallStatusPanel />
      <div className="dm-messages-list">
        {messages?.map((msg) => (
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
