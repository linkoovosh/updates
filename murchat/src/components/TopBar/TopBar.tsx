import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setDmView, togglePinnedMessages } from '../../store/slices/chatSlice';
import { setSelectedChannelId, setSelectedServerId } from '../../store/slices/serverSlice';
import { toggleMembersSidebar } from '../../store/slices/uiSlice';
import './TopBar.css';
import webSocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from '@common/types';
import type { AddFriendPayload, User } from '@common/types';
import { generateAvatarColor, getInitials } from "../../utils/avatarUtils";
import SupportModal from '../Support/SupportModal'; 
import ServerDropdown from '../Servers/ServerDropdown'; 
import InviteModal from '../Invites/InviteModal'; 
import { MicIcon, UserIcon, MailIcon } from '../UI/Icons'; // IMPORT ICONS

// Simple SVG Icons
const Icons = {
  Hash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>,
  Volume: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  VolumeMute: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4l-4.07 2.71M23 9l-6 6"/></svg>,
  Bell: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  BellOff: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Pin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Users: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Help: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  // Windows 11 Style Icons
  Minimize: () => <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>,
  Maximize: () => <svg width="10" height="10" viewBox="0 0 10 10"><rect width="9" height="9" x="0.5" y="0.5" stroke="currentColor" strokeWidth="1" fill="none" /></svg>,
  Restore: () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5,2.5 L2.5,9.5 L9.5,9.5 L9.5,2.5 L2.5,2.5 Z M2.5,2.5 L2.5,0.5 L7.5,0.5 L9.5,2.5 M7.5,0.5 L7.5,2.5" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" /><rect width="7" height="7" x="0.5" y="2.5" stroke="currentColor" strokeWidth="1" fill="none" /><path d="M2.5,2.5 L7.5,2.5 L7.5,7.5" stroke="currentColor" strokeWidth="1" fill="none" /></svg>,
  RestoreClean: () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5,2.5 L9.5,2.5 L9.5,9.5 L2.5,9.5 Z" stroke="none" fill="none"/><rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none"/><path d="M2.5,2.5 L2.5,0.5 L9.5,0.5 L9.5,7.5 L7.5,7.5" stroke="currentColor" strokeWidth="1" fill="none"/></svg>,
  Close: () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5,0.5 L9.5,9.5 M9.5,0.5 L0.5,9.5" stroke="currentColor" strokeWidth="1" fill="none" /></svg>,
  ChevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  MoreVertical: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
};

type Tab = 'online' | 'all' | 'pending' | 'add';

interface TopBarProps {
  activeFriendTab: Tab;
  setActiveFriendTab: (tab: Tab) => void;
}

const TopBar: React.FC<TopBarProps> = ({ activeFriendTab, setActiveFriendTab }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false); // NEW
  const [isServerDropdownOpen, setIsServerDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [isSearchExpanded, setIsSearchExpanded] = useState(false); // NEW
  const dispatch: AppDispatch = useDispatch();

  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const servers = useSelector((state: RootState) => state.server.servers) || [];
  const channels = useSelector((state: RootState) => state.ui.channels) || [];
  const dmView = useSelector((state: RootState) => state.chat.dmView);
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId);
  const users = useSelector((state: RootState) => state.auth.users) || {};
  const showMembersSidebar = useSelector((state: RootState) => state.ui.showMembersSidebar);
  const pinnedMessagesOpen = useSelector((state: RootState) => state.chat.pinnedMessagesOpen);
  
  const currentServer = servers.find(s => s.id === selectedServerId);
  const currentChannel = channels.find(c => c.id === selectedChannelId) || 
                         (dmView === 'chat' ? { id: selectedChannelId, name: 'Direct Message', type: 'dm' } : null);

  const activeDmUser = activeDmConversationId ? users[activeDmConversationId] : null;

  // Electron Window Controls
  const handleMinimize = () => window.electron?.minimize();
  const handleMaximize = () => window.electron?.maximize();
  const handleClose = () => window.electron?.close();

  const handleServerDropdownToggle = (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 10, left: rect.left });
      setIsServerDropdownOpen(!isServerDropdownOpen);
  };

  const handleSearchToggle = () => {
      setIsSearchExpanded(!isSearchExpanded);
  };

  useEffect(() => {
    if (window.electron?.onMaximizeChange) {
      window.electron.onMaximizeChange((maximized: boolean) => {
        setIsMaximized(maximized);
      });
    }
  }, []);

  // Close mobile menu on click outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          const target = event.target as HTMLElement;
          if (isMobileMenuOpen && !target.closest('.mobile-menu-container')) {
              setIsMobileMenuOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  const serverName = currentServer ? currentServer.name : 'MurChat';
  const channelName = currentChannel ? currentChannel.name : 'Главная';

  return (
    <div className={`topbar glass-panel ${isSearchExpanded ? 'search-expanded' : ''}`}>
      
      {/* --- LEFT: Server / DM Info or Friends Header --- */}
      <div className={`topbar-left ${isSearchExpanded ? 'hide-on-mobile' : ''}`}>
        {!selectedServerId ? (
          activeDmConversationId && activeDmUser ? (
             /* DM Header */
             <>
                <div className="channel-icon" style={{ fontSize: '24px', marginRight: '8px', color: 'var(--text-tertiary)' }}><UserIcon /></div>
                <div className="channel-name" style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{activeDmUser.username}</div>
             </>
          ) : (
            /* Friends Header */
            <div className="friends-header-content">
              <h2 className="desktop-only">Друзья</h2>
              <div className="friend-tabs">
                <button className={activeFriendTab === 'online' ? 'active' : ''} onClick={() => setActiveFriendTab('online')}>В сети</button>
                <button className={activeFriendTab === 'all' ? 'active' : ''} onClick={() => setActiveFriendTab('all')}>Все</button>
                <button className={activeFriendTab === 'pending' ? 'active' : ''} onClick={() => setActiveFriendTab('pending')}>Ожидает</button>
                <button className={activeFriendTab === 'add' ? 'active' : ''} onClick={() => setActiveFriendTab('add')}>Добавить в друзья</button>
              </div>
            </div>
          )
        ) : (
          <>
            <div className="divider" />
            <div className="server-icon-placeholder">
                {serverName.charAt(0).toUpperCase()}
            </div>
            <div className="server-name">{serverName}</div>
            <button className="server-dropdown" title="Настройки сервера" onClick={handleServerDropdownToggle}>
              <Icons.ChevronDown />
            </button>
            {isServerDropdownOpen && selectedServerId && (
                <ServerDropdown 
                    serverId={selectedServerId} 
                    onClose={() => setIsServerDropdownOpen(false)} 
                    onOpenCreateChannel={() => {
                        // TODO: Implement Create Channel modal trigger if needed here
                        alert('Создание канала временно доступно через контекстное меню сайдбара');
                    }}
                    position={dropdownPosition}
                />
            )}
          </>
        )}
      </div>

      {/* --- CENTER: Channel Info or empty space --- */}
      <div className={`topbar-center ${isSearchExpanded ? 'hide-always' : ''}`}>
        {selectedServerId && selectedChannelId && (
            <>
                <div className="channel-icon">
                    {currentChannel?.type === 'voice' ? <MicIcon /> : <Icons.Hash />}
                </div>
                <div className="channel-name">{channelName}</div>
                <div className="channel-tools desktop-only">
                    <button 
                      className="icon-btn" 
                      title={notificationsMuted ? "Включить уведомления" : "Отключить уведомления"}
                      onClick={() => setNotificationsMuted(!notificationsMuted)}
                      style={{ opacity: notificationsMuted ? 1 : 0.6, color: notificationsMuted ? 'var(--status-negative)' : 'inherit' }}
                    >
                      {notificationsMuted ? <Icons.BellOff /> : <Icons.Bell />}
                    </button>
                    <button 
                      className={`icon-btn ${pinnedMessagesOpen ? 'active' : ''}`} 
                      title="Закрепленные сообщения"
                      onClick={() => dispatch(togglePinnedMessages())}
                      style={{ opacity: pinnedMessagesOpen ? 1 : 0.6, color: pinnedMessagesOpen ? 'var(--text-primary)' : 'inherit' }}
                    >
                      <Icons.Pin />
                    </button>
                    <button 
                      className={`icon-btn ${showMembersSidebar ? 'active' : ''}`} 
                      title={showMembersSidebar ? "Скрыть список участников" : "Показать список участников"}
                      onClick={() => dispatch(toggleMembersSidebar())}
                      style={{ opacity: showMembersSidebar ? 1 : 0.6, color: showMembersSidebar ? 'var(--text-primary)' : 'inherit' }}
                    >
                      <Icons.Users />
                    </button>
                </div>
            </>
        )}
      </div>

      {/* --- RIGHT: Tools & Window --- */}
      <div className="topbar-right">
        <div className={`desktop-only-flex ${isSearchExpanded ? 'expand-full' : ''}`}>
            <button className={`icon-btn ${isSearchExpanded ? 'hide-always' : ''}`} onClick={() => setIsMuted(!isMuted)} title={isMuted ? "Включить звук" : "Выключить звук"}>
                {isMuted ? <Icons.VolumeMute /> : <Icons.Volume />}
            </button>
            
            <div className={`divider ${isSearchExpanded ? 'hide-always' : ''}`} />

            <div className={`search-box ${isSearchExpanded ? 'expanded' : ''}`}>
                <input 
                    type="text" 
                    placeholder="Поиск" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchExpanded(true)}
                    onBlur={() => !searchQuery && setIsSearchExpanded(false)}
                />
                {!isSearchExpanded && (
                    <div className="search-icon-hint" onClick={() => setIsSearchExpanded(true)}>
                        <Icons.Search />
                    </div>
                )}
            </div>

            <button className={`icon-btn ${isSearchExpanded ? 'hide-always' : ''}`} title="Помощь" onClick={() => setIsSupportModalOpen(true)}><Icons.Help /></button>
        </div>

        {/* Mobile Menu Button */}
        <div className="mobile-menu-container">
            <button className={`icon-btn mobile-menu-btn ${isMobileMenuOpen ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                <Icons.MoreVertical />
            </button>
            
            {isMobileMenuOpen && (
                <div className="mobile-dropdown glass-panel">
                    {/* Search in dropdown for mobile */}
                    <div className="mobile-search-box">
                        <input 
                            type="text" 
                            placeholder="Поиск" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        <Icons.Search />
                    </div>
                    
                    <div className="mobile-dropdown-item" onClick={() => setIsMuted(!isMuted)}>
                        <span>{isMuted ? "Включить звук" : "Выключить звук"}</span>
                        {isMuted ? <Icons.VolumeMute /> : <Icons.Volume />}
                    </div>
                    
                    {selectedServerId && selectedChannelId && (
                        <>
                            <div className="mobile-dropdown-separator" />
                            <div className="mobile-dropdown-item" onClick={() => setNotificationsMuted(!notificationsMuted)}>
                                <span>{notificationsMuted ? "Вкл. уведомления" : "Выкл. уведомления"}</span>
                                {notificationsMuted ? <Icons.BellOff /> : <Icons.Bell />}
                            </div>
                            <div className="mobile-dropdown-item" onClick={() => dispatch(togglePinnedMessages())}>
                                <span>Закрепленные</span>
                                <Icons.Pin />
                            </div>
                            <div className="mobile-dropdown-item" onClick={() => dispatch(toggleMembersSidebar())}>
                                <span>{showMembersSidebar ? "Скрыть участников" : "Показать участников"}</span>
                                <Icons.Users />
                            </div>
                        </>
                    )}
                    
                    <div className="mobile-dropdown-separator" />
                    <div className="mobile-dropdown-item">
                        <span>Помощь</span>
                        <Icons.Help />
                    </div>
                </div>
            )}
        </div>
      </div>
      
      <SupportModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />
    </div>
  );
};

export default TopBar;