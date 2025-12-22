import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
// import './DmFriendsDropdown.css'; // Removed
import type { User } from '@common/types';

interface DmFriendsDropdownProps {
  onSelectDm: (userId: string) => void;
  onClose: () => void;
}

const DmFriendsDropdown: React.FC<DmFriendsDropdownProps> = ({ onSelectDm, onClose }) => {
  const friends = useSelector((state: RootState) => state.auth.friends);

  const handleFriendClick = (friendId: string) => {
    onSelectDm(friendId);
    onClose();
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, cursor: 'default' }} onClick={onClose} />
      <div className="glass-menu" style={{ 
          position: 'absolute', 
          top: '40px', 
          right: '10px', 
          width: '280px', 
          zIndex: 9999,
          maxHeight: '400px',
          overflowY: 'auto' 
      }}>
        <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Личные чаты
        </div>
        <div className="glass-menu-separator" />
        
        {friends.length > 0 ? (
          friends.map((friend: User) => (
            <div 
              key={friend.id} 
              className="glass-menu-item" 
              onClick={() => handleFriendClick(friend.id)}
            >
              <div 
                  className="friend-avatar" 
                  style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      backgroundImage: friend.avatar ? `url(${friend.avatar})` : 'none',
                      backgroundColor: friend.avatar ? 'transparent' : '#5865F2',
                      backgroundSize: 'cover'
                  }} 
              />
              <span style={{ flex: 1 }}>{friend.username}</span>
              <div className={`status-dot ${friend.status || 'offline'}`} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: friend.status === 'online' ? '#3BA55D' : '#747F8D' }} />
            </div>
          ))
        ) : (
          <div style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>
              Список друзей пуст.
          </div>
        )}
      </div>
    </>
  );
};

export default DmFriendsDropdown;
