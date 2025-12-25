
import React, { useEffect, useRef, useState, useMemo } from 'react';
import './UserProfilePopup.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setUserProfileForId, setUserStatusMenuOpen, cacheUser, logout } from '../../store/slices/authSlice';
import { setActiveDmConversationId, setDmView } from '../../store/slices/chatSlice';
import { setSelectedServerId } from '../../store/slices/serverSlice';
import { setSettingsPanelOpen } from '../../store/slices/uiSlice';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import { makeSelectTargetUser } from '../../store/slices/selectors';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types';
import type { Role } from '@common/types';

import StatusMenu from '../StatusMenu/StatusMenu';
import { 
    SettingsIcon, ShieldIcon, MailIcon, PlusIcon, InfoIcon, CheckIcon, MicIcon 
} from '../UI/Icons'; // ADDED MicIcon

const UserProfilePopup = ({ userId }: { userId: string }) => {
  const dispatch: AppDispatch = useDispatch();
  
  const loggedInUserId = useSelector((state: RootState) => state.auth.userId);
  const friends = useSelector((state: RootState) => state.auth.friends);
  const incomingRequests = useSelector((state: RootState) => state.auth.incomingRequests);
  const outgoingRequests = useSelector((state: RootState) => state.auth.outgoingRequests);
  
  // Memoized selector for target user
  const selectTargetUser = useMemo(makeSelectTargetUser, []);
  const cachedUser = useSelector((state: RootState) => selectTargetUser(state, userId));
  const myProfile = useSelector((state: RootState) => state.auth);
  const serverRoles = useSelector((state: RootState) => state.server.currentServerRoles);
  const customThemes = useSelector((state: RootState) => state.customThemes.themes);

  const isStatusMenuOpen = useSelector((state: RootState) => state.auth.isStatusMenuOpen);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  
  const isSelf = userId === loggedInUserId;
  const targetUser = cachedUser; // Relies on updated selector which handles isSelf and members

  const isFriend = friends.some(f => f.id === userId);
  const hasOutgoingRequest = outgoingRequests.some(r => r.id === userId);
  const hasIncomingRequest = incomingRequests.some(r => r.id === userId);

  const handleClose = () => {
    dispatch(setUserProfileForId(null));
    dispatch(setUserStatusMenuOpen(false));
  };

  const handleAddFriend = () => {
    if (!targetUser?.username || !targetUser?.discriminator) return;
    webSocketService.sendMessage(C2S_MSG_TYPE.ADD_FRIEND, { 
        username: targetUser.username, 
        discriminator: targetUser.discriminator 
    });
  };

  const handleLogout = () => {
    try {
        webSocketService?.disconnect();
    } catch (e) { console.error(e); }
    
    localStorage.removeItem('authToken'); 
    dispatch(logout());
    handleClose();
    window.location.reload();
  };
  
  const handleCopyUsername = () => {
    if (!targetUser?.username || !targetUser?.discriminator) return;
    const fullTag = `${targetUser.username}#${targetUser.discriminator}`;
    
    if (window.electron) {
        window.electron.writeToClipboard(fullTag);
    } else {
        navigator.clipboard.writeText(fullTag).catch(err => console.error("Copy failed", err));
    }
    
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  const handleSendMessage = () => {
      if (targetUser?.id) {
          dispatch(cacheUser({
              userId: targetUser.id,
              username: targetUser.username || 'Unknown',
              avatar: targetUser.avatar
          }));
          dispatch(setSelectedServerId(null));
          dispatch(setActiveDmConversationId(targetUser.id));
          dispatch(setDmView('dms'));
          handleClose();
      }
  };

  const handleCall = () => {
      if (targetUser?.id) {
          webSocketService.startCall(targetUser.id, { 
              username: targetUser.username || 'Unknown', 
              avatar: targetUser.avatar || undefined 
          });
          handleClose();
      }
  };

  // --- Optimized Holographic Tilt Logic ---
  const requestRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });

  const updateCard = () => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((mouseRef.current.y - centerY) / centerY) * -12; // Slightly more tilt
      const rotateY = ((mouseRef.current.x - centerX) / centerX) * 12;

      cardRef.current.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`;
      
      if (shineRef.current) {
          const moveX = (mouseRef.current.x / rect.width) * 100;
          const moveY = (mouseRef.current.y / rect.height) * 100;
          shineRef.current.style.backgroundPosition = `${moveX}% ${moveY}%`;
      }
      
      requestRef.current = requestAnimationFrame(updateCard);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
      };
      if (!requestRef.current) {
          requestRef.current = requestAnimationFrame(updateCard);
      }
  };

  const onMouseLeave = () => {
      if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = undefined;
      }
      if (cardRef.current) {
          cardRef.current.style.transform = `perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      }
      if (shineRef.current) {
          shineRef.current.style.backgroundPosition = `100% 100%`;
      }
  };

  useEffect(() => {
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, []);

  if (!targetUser) return null;

  const { username, discriminator, avatar, status, bio, profile_banner, roles, profile_theme } = targetUser;
  
  // Resolve roles
  const userRoles: Role[] = [];
  if (roles && serverRoles.length > 0) {
      if (Array.isArray(roles) && roles.length > 0 && typeof roles[0] === 'string') {
          roles.forEach((rId: string) => {
              const r = serverRoles.find(sr => sr.id === rId);
              if (r) userRoles.push(r);
          });
          userRoles.sort((a, b) => b.position - a.position);
      }
  }

  const avatarColor = avatar ? 'var(--accent-primary)' : generateAvatarColor(username || '');
  const activeTheme = profile_theme || 'holographic';
  const customTheme = customThemes.find(t => t.id === activeTheme);

  // Helper to handle border logic (backwards compatibility)
  const getBorder = (val: string) => val.includes('solid') || val.includes('dashed') || val.includes('dotted') ? val : `1px solid ${val}`;

  // Dynamic Styles if Custom Theme
  const cardStyle: React.CSSProperties = customTheme ? {
      background: customTheme.config.bgImage ? `url(${customTheme.config.bgImage}) center/cover no-repeat` : customTheme.config.cardBg,
      border: getBorder(customTheme.config.cardBorder),
      boxShadow: customTheme.config.cardShadow,
      backdropFilter: `blur(${customTheme.config.cardBlur}px) saturate(${customTheme.config.backdropSaturate || 100}%)`,
      color: customTheme.config.textColor,
      borderRadius: customTheme.config.borderRadius || '24px',
      backfaceVisibility: 'hidden'
  } : { backfaceVisibility: 'hidden' };

  const avatarWrapperStyle: React.CSSProperties = customTheme ? {
      border: customTheme.config.avatarBorder, // User inputs full CSS for avatar border usually
      boxShadow: customTheme.config.avatarGlow
  } : {};

  const nameStyle: React.CSSProperties = customTheme ? {
      color: customTheme.config.textColor
  } : {};
  
  // Standard center position for all popups
  const containerStyle: React.CSSProperties = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
  };

  return (
    <>
        <div className="user-profile-overlay" onClick={handleClose}></div>
        
        <div 
            className={`user-profile-popup ${isSelf ? 'is-self-launch' : ''} theme-${activeTheme}`} 
            style={containerStyle}
        >
            <div 
                className={`holo-card theme-${activeTheme} ${customTheme ? 'custom-theme-override' : ''}`} 
                ref={cardRef}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                style={cardStyle}
            >
                <div className="holo-shine" ref={shineRef} style={{ opacity: customTheme?.config.shineOpacity ?? 0.3 }} />
                {!customTheme && <div className="adaptive-glow" style={{ backgroundColor: avatarColor }} />}

                <div 
                    className="profile-banner" 
                    style={{ 
                        backgroundImage: profile_banner ? `url(${profile_banner})` : `linear-gradient(135deg, ${customTheme?.config.accentColor || avatarColor}, #000)`,
                    }} 
                />

                <div className="profile-content">
                    <div className="profile-avatar-wrapper" style={avatarWrapperStyle}>
                        <div 
                            className="profile-avatar"
                            style={{ 
                                backgroundColor: avatar ? 'transparent' : (customTheme?.config.accentColor || avatarColor),
                                backgroundImage: avatar ? `url(${avatar})` : 'none',
                            }}
                            onClick={() => {
                                if(isSelf) dispatch(setSettingsPanelOpen(true));
                            }}
                        >
                            {!avatar && getInitials(username || '')}
                        </div>
                        <div className={`status-ring ${status || 'offline'}`} />
                    </div>

                    <div className="user-identity" onClick={handleCopyUsername}>
                        <span className="user-name" style={nameStyle}>{username}</span>
                        <span className="user-discriminator">#{discriminator}</span>
                        {isCopied && <div className="copied-toast">ID Скопирован</div>}
                    </div>

                    {userRoles.length > 0 && (
                        <div className="role-pills">
                            {userRoles.map(role => (
                                <div key={role.id} className="role-pill" style={{ border: `1px solid ${role.color}44`, color: role.color }}>
                                    <div className="role-dot" style={{ backgroundColor: role.color }} />
                                    {role.name}
                                </div>
                            ))}
                        </div>
                    )}

                    {(bio || isSelf) && (
                        <div className="bio-box" style={{ borderLeft: `2px solid ${avatarColor}` }}>
                            <div className="bio-label">Data_Signal</div>
                            {bio || (isSelf ? <span style={{opacity: 0.5}} onClick={() => { dispatch(setSettingsPanelOpen(true)); handleClose(); }}>Заполнить данные...</span> : 'Био отсутствует.')}
                        </div>
                    )}

                    <div className="actions-grid">
                        {isSelf ? (
                            <>
                                <button className="holo-btn primary" onClick={() => {
                                    dispatch(setSettingsPanelOpen(true));
                                    handleClose();
                                }}>
                                    <span><SettingsIcon /></span> Настройки
                                </button>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <button className="holo-btn" style={{ width: '100%' }} onClick={() => dispatch(setUserStatusMenuOpen(!isStatusMenuOpen))}>
                                        <span><ShieldIcon /></span> Статус: {status || 'offline'}
                                    </button>
                                    {isStatusMenuOpen && <StatusMenu />} 
                                </div>
                            </>
                        ) : (
                            <>
                                <button className="holo-btn primary" onClick={handleSendMessage}>
                                    <span><MailIcon /></span> Написать
                                </button>

                                <button className="holo-btn primary" onClick={handleCall}>
                                    <span><MicIcon /></span> Позвонить
                                </button>
                                
                                {!isFriend && !hasOutgoingRequest && !hasIncomingRequest && (
                                    <button className="holo-btn secondary" onClick={handleAddFriend}>
                                        <span><PlusIcon /></span> Добавить в друзья
                                    </button>
                                )}
                                
                                {hasOutgoingRequest && (
                                    <button className="holo-btn" disabled style={{ opacity: 0.7, cursor: 'default' }}>
                                        <span><InfoIcon /></span> Запрос отправлен
                                    </button>
                                )}

                                {hasIncomingRequest && (
                                    <button className="holo-btn secondary" onClick={() => webSocketService.sendMessage(C2S_MSG_TYPE.ACCEPT_FRIEND_REQUEST, { userId: targetUser.id })}>
                                        <span><CheckIcon /></span> Принять запрос
                                    </button>
                                )}

                                {isFriend && (
                                    <button className="holo-btn" style={{ color: 'var(--status-positive)' }} disabled>
                                        <span><CheckIcon /></span> В друзьях
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </>
  );
};

export default UserProfilePopup;
