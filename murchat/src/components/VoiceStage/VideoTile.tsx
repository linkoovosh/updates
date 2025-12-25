import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import webSocketService from '../../services/websocket';
import './VoiceStage.css';

interface VideoTileProps {
  userId: string;
  stream?: MediaStream;
  onClick?: () => void;
  isSelected?: boolean;
}

const MicOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ background: '#ed4245', borderRadius: '50%', padding: '2px', color: 'white' }}><line x1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
);

const PopOutIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
);

const VideoTile: React.FC<VideoTileProps> = ({ userId, stream, onClick, isSelected }) => {
  const usersCache = useSelector((state: RootState) => state.auth.users) || {};
  const currentUser = useSelector((state: RootState) => state.auth);
  const voiceStates = useSelector((state: RootState) => state.voice.voiceStates) || {}; 
  const { vadThreshold } = useSelector((state: RootState) => state.settings);

  // Safety: If no userId provided, don't crash
  if (!userId) return null;

  const isLocal = userId === currentUser.userId;
  // Get full user data from cache or current user safely
  const user = isLocal ? currentUser : (usersCache[userId] || {});
  const voiceState = voiceStates ? voiceStates[userId] : null;
  
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = React.useState(1);
  const [hasAudio, setHasAudio] = React.useState(false);

  const hasVideo = stream && stream.getVideoTracks().length > 0;
  
  const normalizedThreshold = (vadThreshold / 100) * 0.5;
  const isSpeaking = voiceState && voiceState.volume ? (voiceState.volume > normalizedThreshold && !voiceState.isMuted) : false; 
  const isMuted = voiceState ? voiceState.isMuted : false;
  
  const username = voiceState?.username || user?.username || userId.substring(0, 8);
  const avatar = voiceState?.avatar || user?.avatar;
  const profileBanner = user?.profile_banner; 
  const hasAvatar = !!avatar && avatar !== 'null' && avatar !== 'undefined';

  React.useEffect(() => {
    if (videoRef.current && stream && hasVideo) {
      const tracks = stream.getTracks();
      if (tracks.every(t => t.readyState === 'ended')) return;
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
          setHasAudio(true);
          videoRef.current.muted = isLocal;
          if (!isLocal) videoRef.current.volume = volume;
      } else {
          setHasAudio(false);
          videoRef.current.muted = true;
      }
    }
  }, [stream, isLocal, hasVideo, volume]);

  const handlePopOut = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (videoRef.current?.requestPictureInPicture) {
          videoRef.current.requestPictureInPicture().catch(() => {});
      }
  };

  return (
    <div 
        className={`video-tile ${isSpeaking ? 'speaking' : ''} ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
    >
      {hasVideo ? (
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted={isLocal}
            className="tile-video" 
        />
      ) : (
        <div className="tile-avatar-container">
           {profileBanner && (
               <div 
                   className="tile-banner-bg"
                   style={{
                       position: 'absolute',
                       inset: 0,
                       backgroundImage: `url(${profileBanner})`,
                       backgroundSize: 'cover',
                       backgroundPosition: 'center',
                       backgroundRepeat: 'no-repeat',
                       opacity: isSpeaking ? 0.85 : 0.35, // Slightly brighter base
                       filter: isSpeaking ? 'blur(0px)' : 'blur(8px) brightness(0.6)', 
                       transform: isSpeaking ? 'scale(1.1)' : 'scale(1)',
                       transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                       zIndex: 0,
                       pointerEvents: 'none'
                   }}
               />
           )}
           
           <div 
                className="tile-avatar"
                style={{ 
                    backgroundColor: generateAvatarColor(username),
                    zIndex: 2,
                    border: isSpeaking ? '2px solid var(--accent-blue)' : '2px solid rgba(255,255,255,0.1)',
                    boxShadow: isSpeaking ? '0 0 20px rgba(var(--accent-blue-rgb), 0.6)' : 'none',
                    transition: 'all 0.3s ease'
                }}
            >
                {hasAvatar ? (
                    <img src={avatar} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    getInitials(username)
                )}
            </div>
        </div>
      )}

      <div className="tile-overlay">
        <div className="tile-name">
            {username}
            {isMuted && <span className="tile-mic-status"><MicOffIcon /></span>}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {stream && hasAudio && !isLocal && (
                <div className="tile-volume-control" onClick={e => e.stopPropagation()}>
                    <input 
                        type="range" 
                        min="0" max="1" step="0.05" 
                        value={volume} 
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        style={{ width: '60px', accentColor: 'var(--accent-blue)' }}
                    />
                </div>
            )}
            {stream && (
                <button className="tile-btn" onClick={handlePopOut}>
                    <PopOutIcon />
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(VideoTile);