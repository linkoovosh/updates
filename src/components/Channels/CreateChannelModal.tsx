import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types.js';
import type { CreateChannelPayload } from '@common/types.js';
import './CreateChannelModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string | null;
}

const CreateChannelModal: React.FC<CreateChannelModalProps> = ({ isOpen, onClose, serverId }) => {
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice' | 'forum'>('text');
  const [isPrivate, setIsPrivate] = useState(false);

  if (!isOpen) return null;

  const handleCreate = () => {
    // Default to 'new-channel' if empty
    const finalName = channelName.trim() || 'new-channel';
    
    if (serverId) {
      const payload: CreateChannelPayload = {
        serverId,
        name: finalName,
        type: channelType,
        isPrivate: isPrivate
      };
      webSocketService.sendMessage(C2S_MSG_TYPE.CREATE_CHANNEL, payload);
      setChannelName('');
      setChannelType('text');
      setIsPrivate(false);
      onClose();
    }
  };

  const channelTypes = [
      {
          id: 'text',
          label: 'Текст',
          description: 'Обменивайтесь сообщениями, изображениями, GIF, эмодзи, мнениями и приколами.',
          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>
      },
      {
          id: 'voice',
          label: 'Голос',
          description: 'Общайтесь голосом, по видео и показывайте экран.',
          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      },
      {
          id: 'forum',
          label: 'Форум',
          description: 'Создайте пространство для обсуждений и важных тем.',
          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      }
  ];

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-channel-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
            <h2>Создать канал</h2>
            <div className="modal-subtitle">в текстовые каналы</div>
            <button className="close-btn" onClick={onClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        
        <div className="modal-body">
            <div className="section-label">ТИП КАНАЛА</div>
            
            <div className="type-selector">
                {channelTypes.map((type) => (
                    <label key={type.id} className={`type-option ${channelType === type.id ? 'selected' : ''}`}>
                        <div className="type-icon">{type.icon}</div>
                        <div className="type-content">
                            <div className="type-title">{type.label}</div>
                            <div className="type-desc">{type.description}</div>
                        </div>
                        <div className="type-radio">
                            <input 
                                type="radio" 
                                name="channelType" 
                                value={type.id} 
                                checked={channelType === type.id} 
                                onChange={() => setChannelType(type.id as any)} 
                            />
                            <div className="radio-circle"></div>
                        </div>
                    </label>
                ))}
            </div>

            <div className="input-group">
                <div className="section-label">НАЗВАНИЕ КАНАЛА</div>
                <div className="channel-input-wrapper">
                    <span className="hashtag">#</span>
                    <input
                        type="text"
                        placeholder="new-channel"
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
          <button className="create-button" onClick={handleCreate} disabled={false}>Создать канал</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CreateChannelModal;