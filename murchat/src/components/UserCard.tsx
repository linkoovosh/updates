import React from 'react';
import './UserCard.css';
import { generateAvatarColor, getInitials } from '../utils/avatarUtils';

interface UserCardProps {
  user: {
    id: string;
    name: string;
    status: 'online' | 'idle' | 'dnd' | 'offline' | 'streaming';
  };
  isOpen: boolean;
  onClose: () => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  const getStatusColor = (status: UserCardProps['user']['status']) => {
    switch (status) {
      case 'online': return 'var(--status-positive)';
      case 'idle': return 'var(--accent-purple)'; // Using purple for idle
      case 'dnd': return 'var(--status-negative)';
      case 'streaming': return 'var(--accent-purple)';
      case 'offline': return 'var(--text-tertiary)';
      default: return 'var(--text-tertiary)';
    }
  };

  return (
    <div className="user-card-overlay" onClick={onClose}>
      <div className="user-card" onClick={(e) => e.stopPropagation()}>
        <div className="user-card-header">
          <div
            className="user-card-avatar"
            style={{ backgroundColor: generateAvatarColor(user.id) }}
          >
            {getInitials(user.name)}
            <div className="user-status-indicator" style={{ backgroundColor: getStatusColor(user.status) }}></div>
          </div>
          <h3 className="user-card-name">{user.name}</h3>
          <span className="user-card-status-text" style={{ color: getStatusColor(user.status) }}>
            {user.status === 'online' ? 'В сети' :
             user.status === 'idle' ? 'Не активен' :
             user.status === 'dnd' ? 'Не беспокоить' :
             user.status === 'streaming' ? 'Транслирует' : 'Оффлайн'}
          </span>
        </div>
        <div className="user-card-actions">
          <button className="user-card-button">Написать</button>
          <button className="user-card-button primary">Профиль</button>
        </div>
      </div>
    </div>
  );
};

export default UserCard;
