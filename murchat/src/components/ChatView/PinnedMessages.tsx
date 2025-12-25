import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { togglePinnedMessages } from '../../store/slices/chatSlice';
import { TrashIcon, CloseIcon } from '../UI/Icons';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types';
import './PinnedMessages.css';

const PinnedMessages: React.FC = () => {
    const dispatch = useDispatch();
    const messages = useSelector((state: RootState) => state.chat.messages);
    const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
    
    // Filter messages that are pinned in the current channel
    const pinnedMessages = messages.filter(m => m.channelId === selectedChannelId && (m as any).isPinned);

    const handleUnpin = (messageId: string) => {
        webSocketService.sendMessage(C2S_MSG_TYPE.UNPIN_MESSAGE, { channelId: selectedChannelId, messageId });
    };

    return (
        <div className="pinned-messages-container glass-panel">
            <div className="pinned-header">
                <h3>📌 Закреплённые сообщения ({pinnedMessages.length})</h3>
                <button className="close-btn" onClick={() => dispatch(togglePinnedMessages())}><CloseIcon /></button>
            </div>
            <div className="pinned-list">
                {pinnedMessages.length === 0 ? (
                    <div className="empty-pinned">Здесь пока ничего не закреплено.</div>
                ) : (
                    pinnedMessages.map(msg => (
                        <div key={msg.id} className="pinned-item">
                            <div className="pinned-item-header">
                                <span className="pinned-author">{msg.author}</span>
                                <span className="pinned-time">{new Date(msg.timestamp).toLocaleString()}</span>
                                <button className="unpin-btn" title="Открепить" onClick={() => handleUnpin(msg.id)}><TrashIcon /></button>
                            </div>
                            <div className="pinned-content">
                                {msg.content.substring(0, 100)}{msg.content.length > 100 ? '...' : ''}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default PinnedMessages;
