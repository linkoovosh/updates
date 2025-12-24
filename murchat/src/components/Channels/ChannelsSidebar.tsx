import React, { useState, useRef, useEffect } from 'react';
import './ChannelsSidebar.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setSelectedChannelId, openServerSettings } from '../../store/slices/serverSlice';
import { setVoiceChannel, clearVoiceChannel, updateVoiceState } from '../../store/slices/voiceSlice';
import { setUserProfileForId } from '../../store/slices/authSlice';
import { setShowAccessDenied } from '../../store/slices/uiSlice'; // NEW
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import webSocketService from '../../services/websocket';
import CreateChannelModal from './CreateChannelModal';
import EditChannelModal from './EditChannelModal'; // NEW
import ChannelContextMenu from './ChannelContextMenu'; // NEW
import { Badge } from '../Badge/Badge'; // NEW
import DmList from '../Dms/DmList';
import ServerDropdown from '../Servers/ServerDropdown'; 
import { usePermissions } from '../../hooks/usePermissions'; // NEW
import { PERMISSIONS, hasPermission } from '../../../common/permissions'; // NEW
import { 
    MicIcon, LockIcon, ShieldIcon, PlusIcon, BellIcon, InfoIcon, TrashIcon 
} from '../UI/Icons'; 
import { C2S_MSG_TYPE } from '@common/types';
import type { Channel } from '@common/types';

// Icons
const VoiceChannelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="channel-icon-svg">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);

const TextChannelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="channel-icon-svg">
    <line x1="4" y1="9" x2="20" y2="9"></line>
    <line x1="4" y1="15" x2="20" y2="15"></line>
    <line x1="10" y1="3" x2="8" y2="21"></line>
    <line x1="16" y1="3" x2="14" y2="21"></line>
  </svg>
);

const ForumChannelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="channel-icon-svg">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
  </svg>
);

interface ChannelsSidebarProps {
  className?: string;
}

const ChannelsSidebar: React.FC<ChannelsSidebarProps> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const username = useSelector((state: RootState) => state.auth.username);
  const userId = useSelector((state: RootState) => state.auth.userId); // Needed for owner check
  const avatar = useSelector((state: RootState) => state.auth.avatar);
  const activeVoiceChannelId = useSelector((state: RootState) => state.voice.activeVoiceChannelId);
  const voiceStates = useSelector((state: RootState) => state.voice.voiceStates); // Fixed selector
  const unreadCounts = useSelector((state: RootState) => state.chat.unreadCounts);
  const mentionCounts = useSelector((state: RootState) => state.chat.mentionCounts);
  const allChannels = useSelector((state: RootState) => state.ui.channels);
  const servers = useSelector((state: RootState) => state.server.servers);
  const users = useSelector((state: RootState) => state.auth.users);
  const vadThreshold = useSelector((state: RootState) => state.settings.vadThreshold); // NEW

  // Permissions
  const userPerms = usePermissions(selectedServerId);
  const canAccessPrivate = hasPermission(userPerms, PERMISSIONS.ADMINISTRATOR) || 
                           hasPermission(userPerms, PERMISSIONS.MANAGE_SERVER) || 
                           hasPermission(userPerms, PERMISSIONS.MANAGE_CHANNELS);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null); // NEW
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null); // NEW
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      // Cleanup if needed
  }, []);

  if (!selectedServerId) {
    return <DmList />;
  }

  const currentServer = servers.find(s => s.id === selectedServerId);
  const headerTitle = currentServer ? currentServer.name : 'MurChat';
  const isOwner = currentServer?.ownerId === userId; // Check ownership

  const serverChannels = allChannels.filter(c => c.serverId === selectedServerId);
  // Sort channels by position if available, or name? Database has position now.
  // Assuming array is somewhat ordered or we sort here. 
  // Simple sort by name for now unless position is implemented in UI DnD
  const textChannels = serverChannels.filter(c => c.type === 'text');
  const voiceChannels = serverChannels.filter(c => c.type === 'voice');
  const forumChannels = serverChannels.filter(c => c.type === 'forum');

  const checkAccess = (channel: Channel) => {
      if (channel.isPrivate && !canAccessPrivate && !isOwner) {
          dispatch(setShowAccessDenied(true));
          return false;
      }
      return true;
  };

  const handleTextChannelClick = (channel: Channel) => {
    if (!checkAccess(channel)) return;
    dispatch(setSelectedChannelId(channel.id));
    dispatch(clearUnreadCount(channel.id)); // NEW: Clear counts on click
    webSocketService.getChannelMessages(channel.id); // Request messages for the new channel
  };

  const handleVoiceChannelClick = (channel: Channel) => {
    if (!checkAccess(channel)) return;
    const channelId = channel.id;
    const selfId = webSocketService.getUserId();
    if (activeVoiceChannelId === channelId) {
      webSocketService.leaveVoiceChannel(channelId);
      dispatch(clearVoiceChannel());
      dispatch(setSelectedChannelId(null));
    } else {
      if(activeVoiceChannelId) {
        webSocketService.leaveVoiceChannel(activeVoiceChannelId);
      }
      if (selfId) {
        webSocketService.joinVoiceChannel(channelId);
        dispatch(setVoiceChannel({ 
            channelId, 
            members: [{ 
                userId: selfId, 
                username: username || 'Unknown', 
                avatar: avatar || undefined 
            }] 
        }));
        dispatch(setSelectedChannelId(channelId)); 
      }
    }
  };

  const handleDropdownClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (dropdownPosition) {
          setDropdownPosition(null);
      } else if (dropdownRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          setDropdownPosition({ top: rect.bottom + 5, left: rect.left });
      }
  };

  const handleChannelContextMenu = (e: React.MouseEvent, channel: Channel) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, channel });
  };

  const handleDeleteChannel = (channelId: string) => {
      if (confirm('Вы уверены, что хотите удалить этот канал?')) {
          webSocketService.sendMessage(C2S_MSG_TYPE.DELETE_CHANNEL, { channelId });
          if (selectedChannelId === channelId) dispatch(setSelectedChannelId(null));
      }
  };

  const getChannelBadge = (channelId: string) => {
      const mentions = mentionCounts[channelId] || 0;
      const unread = unreadCounts[channelId] || 0;
      
      if (mentions > 0) return <Badge count={mentions} variant="count" color="red" className="channel-badge" />;
      if (unread > 0) return <Badge count={unread} variant="count" color="gray" className="channel-badge" />; // Or dot if preferred
      return null;
  };

  const bannerStyle = currentServer?.banner ? {
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.7)), url("${currentServer.banner}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)'
  } : {};

  return (
    <div className={`channels-sidebar glass-panel ${className || ''}`}>
      <div className="channel-header" style={bannerStyle} key={currentServer?.banner}>
        <div className="header-info">
          <h3>{headerTitle}</h3>
          {currentServer?.description && (
            <div className="server-description" title={currentServer.description}>
              {currentServer.description}
            </div>
          )}
        </div>
        <div 
            className="server-settings-icon" 
            onClick={handleDropdownClick}
            title="Меню сервера"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
            ref={dropdownRef}
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: dropdownPosition ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'white' }}>
                <path d="M6 9l6 6 6-6"/>
            </svg>
            {dropdownPosition && (
                <ServerDropdown 
                    serverId={selectedServerId} 
                    onClose={() => setDropdownPosition(null)}
                    onOpenCreateChannel={() => setIsCreateModalOpen(true)}
                    position={dropdownPosition}
                />
            )}
        </div>
      </div>
      <div className="channel-list">
          {/* Text Channels */}
          <div className="channel-category">
            <div className="channel-category-title" onClick={() => setIsCreateModalOpen(true)} title="Create Channel">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldIcon /> Текстовые каналы</span>
              <span className="create-channel-plus"><PlusIcon /></span>
            </div>
            {textChannels.map((channel) => (
              <div
                key={channel.id}
                className={`channel-item ${selectedChannelId === channel.id ? 'selected' : ''} ${unreadCounts[channel.id] > 0 ? 'unread' : ''}`}
                onClick={() => handleTextChannelClick(channel)}
                onContextMenu={(e) => handleChannelContextMenu(e, channel)} // Context Menu
              >
                <span className="channel-icon"><TextChannelIcon /></span> {channel.name} {channel.isPrivate && <span title="Private" style={{ marginLeft: 'auto' }}><LockIcon /></span>}
                {getChannelBadge(channel.id)}
              </div>
            ))}
          </div>

          {/* Voice Channels */}
          <div className="channel-category">
            <div className="channel-category-title" onClick={() => setIsCreateModalOpen(true)} title="Create Channel">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MicIcon /> Голосовые каналы</span>
                <span className="create-channel-plus"><PlusIcon /></span>
            </div>
            {voiceChannels.map((channel) => {
              const channelMembers = voiceStates ? Object.keys(voiceStates).filter(id => voiceStates[id] && voiceStates[id].channelId === channel.id) : [];
              
              return (
              <div key={channel.id}>
                <div 
                    className={`channel-item voice ${activeVoiceChannelId === channel.id ? 'active-voice' : ''} ${unreadCounts[channel.id] > 0 ? 'unread' : ''}`} 
                    onClick={() => handleVoiceChannelClick(channel)}
                    onContextMenu={(e) => handleChannelContextMenu(e, channel)} // Context Menu
                >
                  <span className="channel-icon"><VoiceChannelIcon /></span> {channel.name} {channel.isPrivate && <span title="Private" style={{ marginLeft: 'auto' }}><LockIcon /></span>}
                  {getChannelBadge(channel.id)}
                </div>
                {channelMembers.length > 0 && (
                  <div className="voice-channel-members">
                                        {channelMembers.map(memberId => {
                                          // Safety check: ensure voice state exists
                                          if (!voiceStates || !voiceStates[memberId]) return null;
                                          
                                          const state = voiceStates[memberId];
                                          const normalizedThreshold = (vadThreshold / 100) * 0.5;
                                          const isSpeaking = state.volume > normalizedThreshold && !state.isMuted;
                                          const user = users ? users[memberId] : undefined;
                                          const displayName = state.username || (user ? user.username : memberId.substring(0, 8) + '...');
                                          const avatarUrl = state.avatar || user?.avatar;
                                          const hasAvatar = !!avatarUrl && avatarUrl !== 'null' && avatarUrl !== 'undefined';
                    
                                          return (
                                            <div key={memberId} className={`voice-member ${isSpeaking ? 'speaking' : ''} ${state.isConnecting ? 'connecting' : ''} ${state.isDisconnected ? 'disconnected' : ''}`} onClick={() => dispatch(setUserProfileForId(memberId))}>
                                              <div className="member-avatar-wrapper">
                                                <div 
                                                    className="member-avatar" 
                                                    style={{ backgroundColor: generateAvatarColor(memberId) }}
                                                >
                                                  {hasAvatar ? (
                                                    <img src={avatarUrl} alt={displayName} />
                                                  ) : (
                                                    getInitials(displayName)
                                                  )}
                                                </div>
                                                {state.isMuted && <span className="voice-state-icon" title="Микрофон выключен">🔇</span>}
                                                {state.isDeafened && <span className="voice-state-icon" title="Звук выключен">🎧</span>}
                                              </div>
                                              <span className="member-name">{displayName}</span>
                                            </div>
                                          );
                                        })}
                  </div>
                )}
              </div>
            )})}
          </div>

          {/* Forum Channels */}
          {forumChannels.length > 0 && (
              <div className="channel-category">
                <div className="channel-category-title" onClick={() => setIsCreateModalOpen(true)} title="Create Channel">
                  <span>Форумы</span>
                  <span className="create-channel-plus">+</span>
                </div>
                {forumChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className={`channel-item ${selectedChannelId === channel.id ? 'selected' : ''} ${unreadCounts[channel.id] > 0 ? 'unread' : ''}`}
                    onClick={() => handleTextChannelClick(channel)} 
                    onContextMenu={(e) => handleChannelContextMenu(e, channel)} // Context Menu
                  >
                    <span className="channel-icon"><ForumChannelIcon /></span> {channel.name} {channel.isPrivate && <span title="Private">🔒</span>}
                    {getChannelBadge(channel.id)}
                  </div>
                ))}
              </div>
          )}
      </div>
      
      <CreateChannelModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} serverId={selectedServerId} />
      
      {contextMenu && (
          <ChannelContextMenu 
              position={contextMenu}
              channel={contextMenu.channel}
              onClose={() => setContextMenu(null)}
              onEdit={() => setEditingChannel(contextMenu.channel)}
              onDelete={() => handleDeleteChannel(contextMenu.channel.id)}
              isOwner={!!isOwner}
          />
      )}

      {editingChannel && (
          <EditChannelModal 
              isOpen={!!editingChannel} 
              onClose={() => setEditingChannel(null)} 
              channel={editingChannel} 
          />
      )}
    </div>
  );};

export default ChannelsSidebar;
