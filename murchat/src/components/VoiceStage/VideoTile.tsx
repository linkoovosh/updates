import React, { useEffect, useRef, useMemo } from 'react';
import './VoiceStage.css';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import { makeSelectTargetUser } from '../../store/slices/selectors';

interface VideoTileProps {
  userId: string;
  isFocused?: boolean;
  onFocus?: () => void;
}

const VideoTile: React.FC<VideoTileProps> = ({ userId, isFocused, onFocus }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // ROBUST DATA FETCHING
  const voiceState = useSelector((state: RootState) => state.voice.voiceStates?.[userId]);
  const selectTargetUser = useMemo(makeSelectTargetUser, []);
  const user = useSelector((state: RootState) => selectTargetUser(state, userId));
  const vadThreshold = useSelector((state: RootState) => state.settings.vadThreshold ?? 5);

  const stream = voiceState?.stream;
  const hasVideo = !!stream && stream.getVideoTracks().length > 0;
  
  // Use VAD threshold for speaking indicator
  const normalizedThreshold = (vadThreshold / 100) * 0.5;
  const isSpeaking = (voiceState?.volume || 0) > normalizedThreshold && !voiceState?.isMuted;

  useEffect(() => {
    if (videoRef.current && stream && hasVideo) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasVideo]);

  // SAFETY: If voiceState disappeared, don't render anything to avoid crash
  if (!voiceState) return null;

  const displayName = voiceState.username || user?.username || "Unknown";
  const avatarUrl = voiceState.avatar || user?.avatar;
  const bannerUrl = user?.profile_banner;
  const hasAvatar = !!avatarUrl && avatarUrl !== 'null' && avatarUrl !== 'undefined';

  return (
    <div 
      className={`video-tile ${isSpeaking ? 'speaking' : ''} ${isFocused ? 'focused' : ''} ${hasVideo ? 'has-video' : 'audio-only'}`}
      onClick={onFocus}
    >
      {/* Animated banner background when speaking (only if audio-only) */}
      {!hasVideo && isSpeaking && bannerUrl && (
          <div className="tile-banner-bg" style={{ backgroundImage: `url(${bannerUrl})` }} />
      )}

      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={userId === voiceState.userId} className="video-element" />
      ) : (
        <div className="tile-avatar-container">
            <div className="tile-avatar" style={{ 
                backgroundColor: generateAvatarColor(userId),
                boxShadow: isSpeaking ? `0 0 30px ${generateAvatarColor(userId)}` : 'none'
            }}>
                {hasAvatar ? <img src={avatarUrl} alt={displayName} /> : getInitials(displayName)}
            </div>
        </div>
      )}

      <div className="tile-info">
        <span className="tile-name">{displayName}</span>
        <div className="tile-indicators">
            {voiceState.isMuted && <span className="indicator-icon">🔇</span>}
            {voiceState.isDeafened && <span className="indicator-icon">🎧</span>}
        </div>
      </div>
    </div>
  );
};

export default VideoTile;
