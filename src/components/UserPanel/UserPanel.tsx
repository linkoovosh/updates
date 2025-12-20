import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { updateVoiceState } from '../../store/slices/voiceSlice';
import { setUserProfileForId } from '../../store/slices/authSlice';
import { setSettingsPanelOpen } from '../../store/slices/uiSlice';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import webSocketService from '../../services/websocket';
import { mediasoupService } from '../../services/mediasoup';
import ScreenSharePicker from '../Voice/ScreenSharePicker';
import './UserPanel.css'; 

// Icons
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
);

const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
);

const HeadphoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
);

const HeadphoneOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
);

const MonitorIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
);

const MonitorOffIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"></line>
    <line x1="4" y1="10" x2="4" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12" y2="3"></line>
    <line x1="20" y1="21" x2="20" y2="16"></line>
    <line x1="20" y1="12" x2="20" y2="3"></line>
    <line x1="1" y1="14" x2="7" y2="14"></line>
    <line x1="9" y1="8" x2="15" y2="8"></line>
    <line x1="17" y1="16" x2="23" y2="16"></line>
  </svg>
);

const UserPanel: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const username = useSelector((state: RootState) => state.auth.username);
  const discriminator = useSelector((state: RootState) => state.auth.discriminator);
  const avatar = useSelector((state: RootState) => state.auth.avatar);
  const voiceStates = useSelector((state: RootState) => state.voice.voiceStates);
  const activeVoiceChannelId = useSelector((state: RootState) => state.voice.activeVoiceChannelId); 
  
  const { screenShareResolution, screenShareFps } = useSelector((state: RootState) => state.settings);

  const [showScreenPicker, setShowScreenPicker] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);

  const selfId = webSocketService.getUserId();
  const selfVoiceState = selfId ? voiceStates[selfId] : undefined;
  
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selfId && selfVoiceState) {
        const currentMuteState = selfVoiceState.isMuted;
        const newMuteState = !currentMuteState;
        
        // Update UI state
        dispatch(updateVoiceState({ userId: selfId, partialState: { isMuted: newMuteState } }));
        
        // Update actual hardware/transmission
        mediasoupService.muteAudio(newMuteState);
    } else {
        console.warn("Cannot mute: not connected to voice.");
    }
  };

  const handleToggleDeaf = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selfId && selfVoiceState) {
        const currentDeafState = selfVoiceState.isDeafened;
        dispatch(updateVoiceState({ userId: selfId, partialState: { isDeafened: !currentDeafState } }));
    } else {
         console.warn("Cannot deafen: not connected to voice.");
    }
  };

  const handleToggleScreenShare = (e: React.MouseEvent) => {
      e.stopPropagation();
      
      if (!activeVoiceChannelId) {
          alert("Вы должны находиться в голосовом канале, чтобы начать демонстрацию экрана.");
          return;
      }
      
      if (!selfVoiceState) return;

      if (isScreenSharing) {
          mediasoupService.stopScreenShare();
          setIsScreenSharing(false);
      } else {
          setShowScreenPicker(true);
      }
  };

  const handleScreenSelect = (source: { id: string }) => {
      mediasoupService.startScreenShare(source.id, { resolution: screenShareResolution, fps: screenShareFps });
      setIsScreenSharing(true);
      setShowScreenPicker(false);
  };

  const handleOpenProfile = () => {
      if (selfId) {
        dispatch(setUserProfileForId(selfId));
      }
  }
  
  const handleOpenSettings = (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch(setSettingsPanelOpen(true));
  }

  return (
    <>
        {showScreenPicker && (
            <ScreenSharePicker 
                onSelect={handleScreenSelect} 
                onCancel={() => setShowScreenPicker(false)} 
            />
        )}
        <div className="user-panel glass-panel">
        <div className="user-controls-panel">
            <button 
                className={`control-button ${selfVoiceState?.isMuted ? 'active-red' : ''}`} 
                onClick={handleToggleMute} 
                title={selfVoiceState?.isMuted ? "Включить микрофон" : "Выключить микрофон"}
            >
            {selfVoiceState?.isMuted ? <MicOffIcon /> : <MicIcon />}
            </button>
            <button 
                className={`control-button ${selfVoiceState?.isDeafened ? 'active-red' : ''}`} 
                onClick={handleToggleDeaf} 
                title={selfVoiceState?.isDeafened ? "Включить звук" : "Выключить звук"}
            >
            {selfVoiceState?.isDeafened ? <HeadphoneOffIcon /> : <HeadphoneIcon />}
            </button>
            
            {/* Screen Share Button - Only visible when connected */}
            {selfVoiceState && (
                <button 
                    className={`control-button ${isScreenSharing ? 'active-green' : ''}`} 
                    onClick={handleToggleScreenShare} 
                    title={isScreenSharing ? "Остановить стрим" : "Демонстрация экрана"}
                >
                    {isScreenSharing ? <MonitorOffIcon /> : <MonitorIcon />}
                </button>
            )}

            <button className="control-button" onClick={handleOpenSettings} title="Настройки пользователя">
            <SettingsIcon />
            </button>
        </div>

        <div className="user-info" onClick={handleOpenProfile} title="Открыть профиль">
            <div 
                className="user-avatar" 
                style={{ 
                    backgroundColor: avatar ? 'transparent' : generateAvatarColor(username || ''),
                    backgroundImage: avatar ? `url(${avatar})` : 'none',
                    backgroundSize: 'cover'
                }}
            >
                {!avatar && getInitials(username || '')}
            </div>
            <div className="user-details">
                <span className="user-name">{username}</span>
                <span className="user-tag">#{discriminator || '0000'}</span>
            </div>
        </div>
        </div>
    </>
  );
};

export default UserPanel;
