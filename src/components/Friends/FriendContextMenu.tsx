import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { setUserProfileForId } from '../../store/slices/authSlice';
import { setActiveDmConversationId, setDmView } from '../../store/slices/chatSlice';
import { setSelectedServerId } from '../../store/slices/serverSlice';
import websocketService from '../../services/websocket';
// import '../Servers/ServerContextMenu.css'; // Removed

interface FriendContextMenuProps {
  position: { x: number; y: number };
  friend: { id: string; username: string; avatar?: string | null };
  onClose: () => void;
}

const FriendContextMenu: React.FC<FriendContextMenuProps> = ({ position, friend, onClose }) => {
  const dispatch = useDispatch();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleMessage = () => {
      dispatch(setSelectedServerId(null));
      dispatch(setActiveDmConversationId(friend.id));
      dispatch(setDmView('dms'));
      onClose();
  };

  const handleCall = () => {
      handleMessage(); // Go to chat first
      websocketService.startCall(friend.id, { username: friend.username, avatar: friend.avatar || undefined });
      onClose();
  };

  const handleProfile = () => {
      dispatch(setUserProfileForId(friend.id));
      onClose();
  }

  return createPortal(
    <div className="glass-menu" style={{ top: position.y, left: position.x }} ref={menuRef} onClick={e => e.stopPropagation()}>
      <div className="glass-menu-item" onClick={handleProfile}>
          <span className="icon">👤</span> Посмотреть профиль
      </div>
      <div className="glass-menu-item" onClick={handleMessage}>
          <span className="icon">💬</span> Написать сообщение
      </div>
      <div className="glass-menu-separator" />
      <div className="glass-menu-item" onClick={handleCall}>
          <span className="icon">📞</span> Позвонить
      </div>
    </div>,
    document.body
  );
};

export default FriendContextMenu;