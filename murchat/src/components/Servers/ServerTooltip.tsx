import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Server } from '@common/types';
import './ServerTooltip.css';

interface ServerTooltipProps {
  server: Server | null;
  x: number;
  y: number;
}

const ServerTooltip: React.FC<ServerTooltipProps> = ({ server, x, y }) => {
  const channels = useSelector((state: RootState) => state.ui.channels);
  const voiceStates = useSelector((state: RootState) => state.ui.voiceStates);
  const users = useSelector((state: RootState) => state.ui.users);

  // Handle the "Home" button case
  if (server === null) {
    return (
      <div className="server-tooltip" style={{ left: x, top: y }}>
        <div className="tooltip-server-name">Домой</div>
      </div>
    );
  }

  const serverVoiceChannels = channels.filter(c => c.serverId === server.id && c.type === 'voice');
  const serverVoiceChannelIds = new Set(serverVoiceChannels.map(c => c.id));

  const usersInVoice = Object.entries(voiceStates)
    .filter(([userId, state]) => serverVoiceChannelIds.has(state.channelId))
    .map(([userId, state]) => {
      // Try to get full user info from the general user cache if available
      const userInfo = users[userId];
      return {
        userId,
        username: state.username || userInfo?.username || 'Unknown',
        avatar: state.avatar || userInfo?.avatar,
      };
    });

  return (
    <div className="server-tooltip" style={{ left: x, top: y }}>
      <div className="tooltip-server-name">{server.name}</div>
      <div className="tooltip-voice-users">
        {usersInVoice.length > 0 ? (
          usersInVoice.map(user => (
            <img
              key={user.userId}
              src={user.avatar || '/defaul_server_avatars.png'} // Fallback avatar
              alt={user.username}
              className="tooltip-user-avatar"
              title={user.username}
            />
          ))
        ) : (
          <div className="tooltip-no-users">В голосовых чатах никого нет.</div>
        )}
      </div>
    </div>
  );
};

export default ServerTooltip;
