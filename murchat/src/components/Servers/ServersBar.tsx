import React, { useState } from 'react';
import './ServersBar.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setSelectedServerId } from '../../store/slices/serverSlice';
import { setDmView } from '../../store/slices/chatSlice';
import ServerTooltip from './ServerTooltip';
import CreateServerModal from './CreateServerModal';
import ServerContextMenu from './ServerContextMenu';
import CreateChannelModal from '../Channels/CreateChannelModal';
import InviteModal from '../Invites/InviteModal';
import { Badge } from '../Badge/Badge'; // NEW
import websocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from "@common/types";
import type { Server, SetSelectedServerPayload, CreateServerPayload } from "@common/types";

// Use filenames directly for public assets. Ensure vite.config.ts base is './'
const GlavnayaOpen = "./murchat.ico";
const GlavnayaDefault = "./home_default.png";
const OpenServerAvatars = "./open_server_avatars.png";
const DefaulServerAvatars = "./defaul_server_avatars.png";

type Tab = 'online' | 'all' | 'pending' | 'add';

interface ServersBarProps {
  className?: string;
  activeFriendTab: Tab;
  setActiveFriendTab: (tab: Tab) => void;
}

const normalizePath = (path: string | null | undefined) => {
    if (!path) return path;
    // Remove leading slash to make path relative to index.html (for Electron file:// protocol)
    if (path.startsWith('/') || path.startsWith('\\')) {
        return path.substring(1);
    }
    return path;
};

const ServersBar: React.FC<ServersBarProps> = ({ className, activeFriendTab, setActiveFriendTab }) => {
  const dispatch: AppDispatch = useDispatch();
  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const servers = useSelector((state: RootState) => state.server.servers);
  const channels = useSelector((state: RootState) => state.ui.channels); // NEW
  const unreadCounts = useSelector((state: RootState) => state.chat.unreadCounts); // NEW
  const mentionCounts = useSelector((state: RootState) => state.chat.mentionCounts); // NEW
  
  const [isCreateServerModalOpen, setIsCreateServerModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; server: Server } | null>(null);
  const [createChannelServerId, setCreateChannelServerId] = useState<string | null>(null);
  const [inviteServerId, setInviteServerId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ server: Server | null; x: number; y: number } | null>(null);

  const handleServerClick = (serverId: string | null) => {
    dispatch(setSelectedServerId(serverId));
    if (serverId === null) {
      dispatch(setDmView('friends'));
      setActiveFriendTab('online');
    }
    const payload: SetSelectedServerPayload = { selectedServerId: serverId };
    websocketService.sendMessage(C2S_MSG_TYPE.SET_SELECTED_SERVER, payload);
  };

  const handleContextMenu = (e: React.MouseEvent, server: Server) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({ x: rect.right + 10, y: rect.top, server: server });
  };
  
  const handleMouseEnter = (e: React.MouseEvent, server: Server | null) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ server, x: rect.right + 10, y: rect.top });
  };
  
  const handleMouseLeave = () => {
      setTooltip(null);
  };

  const getServerBadge = (serverId: string) => {
      const serverChannelIds = channels.filter(c => c.serverId === serverId).map(c => c.id);
      const mentions = serverChannelIds.reduce((sum, id) => sum + (mentionCounts[id] || 0), 0);
      const unread = serverChannelIds.reduce((sum, id) => sum + (unreadCounts[id] || 0), 0);

      if (mentions > 0) return <Badge count={mentions} variant="count" color="red" className="server-badge" />;
      if (unread > 0) return <Badge variant="dot" className="server-badge" />;
      return null;
  };

  return (
    <div className={`servers-bar glass-panel ${className || ''}`}>
      {/* Home Button */}
      <div 
        className={`server-icon home-icon ${selectedServerId === null ? 'selected' : ''}`}
        onClick={() => handleServerClick(null)}
        onMouseEnter={(e) => handleMouseEnter(e, null)} 
        onMouseLeave={handleMouseLeave}
        title="Главная"
      >
        <img src={selectedServerId === null ? GlavnayaOpen : GlavnayaDefault} alt="Home" />
      </div>
      
      <div className="server-separator" style={{ width: '32px', height: '2px', backgroundColor: 'var(--bg-elevated)', margin: '4px 0' }} />

      {servers.map((server) => (
        <div
          key={server.id}
          className={`server-icon ${selectedServerId === server.id ? 'selected' : ''}`}
          onClick={() => handleServerClick(server.id)}
          onContextMenu={(e) => handleContextMenu(e, server)}
          onMouseEnter={(e) => handleMouseEnter(e, server)}
          onMouseLeave={handleMouseLeave}
          title={server.name}
        >
          <img 
            src={selectedServerId === server.id 
                ? (normalizePath(server.avatar_active) || OpenServerAvatars) 
                : (normalizePath(server.avatar_default) || DefaulServerAvatars)} 
            alt={server.name} 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {getServerBadge(server.id)}
        </div>
      ))}
      
      <div 
        className="server-icon create-server-icon" 
        onClick={() => setIsCreateServerModalOpen(true)}
        title="Create Server"
      >
        +
      </div>

      <CreateServerModal isOpen={isCreateServerModalOpen} onClose={() => setIsCreateServerModalOpen(false)} />
      
      {contextMenu && (
          <ServerContextMenu 
            position={contextMenu} 
            server={contextMenu.server} 
            onClose={() => setContextMenu(null)}
            onCreateChannel={() => setCreateChannelServerId(contextMenu.server.id)}
            onInvite={() => setInviteServerId(contextMenu.server.id)}
          />
      )}
      
      {tooltip && <ServerTooltip server={tooltip.server} x={tooltip.x} y={tooltip.y} />}

      <CreateChannelModal 
        isOpen={!!createChannelServerId} 
        onClose={() => setCreateChannelServerId(null)} 
        serverId={createChannelServerId} 
      />

      {inviteServerId && (
        <InviteModal 
            isOpen={!!inviteServerId}
            onClose={() => setInviteServerId(null)}
            serverId={inviteServerId}
        />
      )}
    </div>
  );
};

export default ServersBar;
