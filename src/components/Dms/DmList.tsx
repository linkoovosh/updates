import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setActiveDmConversationId, setDmView } from '../../store/slices/chatSlice';
import { setSelectedServerId } from '../../store/slices/serverSlice';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import webSocketService from '../../services/websocket';
import DefaulServerAvatars from '/defaul_server_avatars.png'; // Import image
import FriendContextMenu from '../Friends/FriendContextMenu';
import './DmList.css';

const DmList: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const friends = useSelector((state: RootState) => state.auth.friends);
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId);
  const dmView = useSelector((state: RootState) => state.chat.dmView);
  const users = useSelector((state: RootState) => state.auth.users);

  const [contextMenu, setContextMenu] = React.useState<{ x: number, y: number, friend: any } | null>(null);

  console.log('Friends in DmList:', friends); // DEBUG LOG

  // Create a display list that includes the active DM user if they are not a friend
  const displayList = [...friends];
  if (activeDmConversationId && !friends.find(f => f.id === activeDmConversationId)) {
      const cachedUser = users[activeDmConversationId];
      if (cachedUser) {
          // Add the active non-friend to the top of the list
          displayList.unshift({
              id: activeDmConversationId,
              username: cachedUser.username,
              avatar: cachedUser.avatar,
              discriminator: '????',
              status: 'offline' // Or 'unknown'
          } as any);
      }
  }

  const handleFriendClick = (friendId: string) => {
    console.log('DmList: Clicked friend with ID:', friendId);
    dispatch(setActiveDmConversationId(friendId));
  };

  const handleContextMenu = (e: React.MouseEvent, friend: any) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, friend });
  };

  return (
    <div className="channels-sidebar dm-list-container" style={{ zIndex: 100, position: 'relative' }}>
      <div className="dm-list-actions">
        <button 
          className={`friends-button ${dmView === 'friends' ? 'active' : ''}`}
          onClick={() => dispatch(setDmView('friends'))}
        >
          Друзья
        </button>
      </div>
      <div className="dm-list-header">
        <span>ЛИЧНЫЕ СООБЩЕНИЯ</span>
      </div>
      <div className="dm-list">
        {displayList.length > 0 ? (
          displayList.map(friend => {
            // console.log('Rendering friend item:', friend.username);
            return (
            <div 
              key={friend.id} 
              role="button"
              tabIndex={0}
              className={`dm-list-item ${activeDmConversationId === friend.id ? 'active' : ''}`}
              onClick={() => { console.log('Click inline:', friend.id); handleFriendClick(friend.id); }}
              onContextMenu={(e) => handleContextMenu(e, friend)}
              onKeyDown={(e) => e.key === 'Enter' && handleFriendClick(friend.id)}
            >
              <img src={friend.avatar || DefaulServerAvatars} alt={friend.username} className="dm-friend-avatar" style={{ display: friend.avatar ? 'block' : 'none' }} />
              <div className="dm-friend-info">
                <span className="dm-friend-username">{friend.username}</span>
                <span className="dm-friend-status">{friend.status || 'offline'}</span>
              </div>
            </div>
          )})
        ) : (
          <div className="dm-list-empty">
            Здесь пока пусто. Добавьте друзей, чтобы начать общение.
          </div>
        )}
      </div>
      {contextMenu && (
        <FriendContextMenu 
            position={contextMenu} 
            friend={contextMenu.friend} 
            onClose={() => setContextMenu(null)} 
        />
      )}
    </div>
  );
};

export default DmList;
