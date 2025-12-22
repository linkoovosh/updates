import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types.js';
import type { Channel } from '@common/types.js';
import './CreateChannelModal.css'; // Reusing styles

interface EditChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
}

const EditChannelModal: React.FC<EditChannelModalProps> = ({ isOpen, onClose, channel }) => {
  const [channelName, setChannelName] = useState(channel.name);
  const [isPrivate, setIsPrivate] = useState(channel.isPrivate || false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (channelName.trim()) {
      webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_CHANNEL, {
          channelId: channel.id,
          name: channelName.trim(),
          isPrivate: isPrivate
      });
      onClose();
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-channel-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
            <h2>Настройки канала</h2>
            <div className="modal-subtitle">{channel.type === 'voice' ? 'Голосовой' : 'Текстовый'} канал</div>
            <button className="close-btn" onClick={onClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        
        <div className="modal-body">
            <div className="input-group">
                <div className="section-label">НАЗВАНИЕ КАНАЛА</div>
                <div className="channel-input-wrapper">
                    <span className="hashtag">{channel.type === 'voice' ? '🔊' : '#'}</span>
                    <input
                        type="text"
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        className="channel-name-input"
                    />
                </div>
            </div>

            <div className="private-channel-group">
                <div className="private-content">
                    <div className="private-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lock-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span className="private-title">Приватный канал</span>
                    </div>
                    <div className="private-desc">
                        Только выбранные участники и участники с определенными ролями смогут просматривать этот канал.
                    </div>
                </div>
                <label className="toggle-switch">
                    <input 
                        type="checkbox" 
                        checked={isPrivate} 
                        onChange={(e) => setIsPrivate(e.target.checked)} 
                    />
                    <span className="slider round"></span>
                </label>
            </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>Отмена</button>
          <button className="create-button" onClick={handleSave}>Сохранить</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditChannelModal;
