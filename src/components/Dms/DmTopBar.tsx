import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import DefaulServerAvatars from '../../assets/defaul_server_avatars.png';
import './DmTopBar.css';

const DmTopBar: React.FC = () => {
  const { activeDmConversationId, friends, users } = useSelector((state: RootState) => ({
    activeDmConversationId: state.ui.activeDmConversationId,
    friends: state.ui.friends,
    users: state.ui.users,
  }));

  let activeFriend = friends.find(f => f.id === activeDmConversationId);

  if (!activeFriend && activeDmConversationId && users[activeDmConversationId]) {
      const cachedUser = users[activeDmConversationId];
      // Construct a temporary "friend" object for display
      activeFriend = {
          id: activeDmConversationId,
          username: cachedUser.username,
          avatar: cachedUser.avatar,
          discriminator: '????', // Cache might not have it, or we can update cacheUser payload later
          status: 'offline' // We don't track status for non-friends yet
      } as any;
  }

  return (
    <div className="dm-top-bar">
      {activeFriend ? (
        <>
          <img src={activeFriend.avatar || '/defaul_server_avatars.png'} alt={activeFriend.username} className="dm-top-bar-avatar" />
          <span className="dm-top-bar-username">{activeFriend.username}</span>
          {activeFriend.discriminator !== '????' && <span className="dm-top-bar-discriminator">#{activeFriend.discriminator}</span>}
        </>
      ) : (
        <h3 className="dm-top-bar-default">Личные сообщения</h3>
      )}
    </div>
  );
};

export default DmTopBar;
