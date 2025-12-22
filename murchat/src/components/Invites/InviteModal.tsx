import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { C2S_MSG_TYPE } from '@common/types'; 
import type { InviteFriendsToServerPayload } from '@common/types'; 
import webSocketService from '../../services/websocket';
import './InviteModal.css';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
}

const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, serverId }) => {
  const friends = useSelector((state: RootState) => state.auth.friends) || [];
  const servers = useSelector((state: RootState) => state.server.servers) || [];
  const server = serverId ? servers.find(s => s.id === serverId) : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  // Log for debugging
  useEffect(() => {
    if (isOpen) {
        console.log('[InviteModal] Opened for server:', serverId, 'Found:', !!server);
    }
  }, [isOpen, serverId, server]);

  if (!isOpen || !server || !serverId) return null;

  const filteredFriends = friends.filter(f => 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.discriminator?.includes(searchQuery)
  );

  const handleInviteFriend = (friendId: string) => {
    if (!serverId) return;

    const payload: InviteFriendsToServerPayload = {
      serverId: serverId,
      friendIds: [friendId],
    };
    webSocketService.sendMessage(C2S_MSG_TYPE.INVITE_FRIENDS_TO_SERVER, payload);

    setInvitedIds(prev => new Set(prev).add(friendId));
  };
  
  useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return createPortal(
    <div className="invite-modal-overlay" onClick={onClose}>
      <div className="invite-modal-content glass-panel anim-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="invite-modal-header">
          <div className="header-info">
            <h2>Пригласить друзей</h2>
            <div className="server-target">на {server.name}</div>
          </div>
          <button className="close-invite-modal-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="invite-search-wrapper">
            <input 
                type="text" 
                placeholder="Поиск друзей..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
            />
        </div>

        <div className="invite-modal-body">
          <div className="invite-friends-list">
            {filteredFriends.length === 0 ? (
              <div className="invite-empty-state">
                <p>{searchQuery ? 'Никто не найден :(' : 'У вас пока нет друзей.'}</p>
              </div>
            ) : (
              filteredFriends.map((friend) => (
                <div key={friend.id} className="invite-friend-item">
                  <div className="friend-profile">
                    <div className="friend-avatar" style={{ backgroundColor: `var(--accent-blue)` }}>
                        {friend.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="friend-details">
                        <span className="friend-name">{friend.username}</span>
                        <span className="friend-tag">#{friend.discriminator}</span>
                    </div>
                  </div>
                  
                  <button 
                    className={`invite-btn ${invitedIds.has(friend.id) ? 'sent' : ''}`}
                    onClick={() => handleInviteFriend(friend.id)}
                    disabled={invitedIds.has(friend.id)}
                  >
                    {invitedIds.has(friend.id) ? 'Отправлено' : 'Пригласить'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="invite-modal-footer">
            <p>Ваши друзья получат уведомление с кнопкой входа.</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InviteModal;
