import React, { useEffect, useState } from 'react';
import './VoicePanel.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { updateVoiceState } from '../../store/slices/voiceSlice';
import { setUserProfileForId } from '../../store/slices/authSlice';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import webSocketService from '../../services/websocket';
import { webRTCService } from '../../services/webrtc';
import StreamModal from '../Voice/StreamModal';
import SharedBrowserStage from '../Voice/SharedBrowserStage'; // NEW

interface VoicePanelProps {
  className?: string;
}

const VoicePanel: React.FC<VoicePanelProps> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  const activeVoiceChannelId = useSelector((state: RootState) => state.voice.activeVoiceChannelId); 
  const voiceStates = useSelector((state: RootState) => state.voice?.voiceStates || {}); // ADDED OPTIONAL CHAINING
  const users = useSelector((state: RootState) => state.auth.users);

  // Video Streams State
  const [videoStreams, setVideoStreams] = useState<Record<string, MediaStream>>({});
  const [focusedStreamUser, setFocusedStreamUser] = useState<string | null>(null);

  useEffect(() => {
    const handleTrack = (stream: MediaStream, userId: string) => {
        if (stream.getVideoTracks().length > 0) {
            setVideoStreams(prev => ({ ...prev, [userId]: stream }));
            dispatch(updateVoiceState({ userId, partialState: { isScreenSharing: true } }));
        }
    };
    
    const handleLocal = (stream: MediaStream) => {
         if (stream.getVideoTracks().length > 0) {
             const myId = webSocketService.getUserId();
             if (myId) {
                 setVideoStreams(prev => ({ ...prev, [myId]: stream }));
                 dispatch(updateVoiceState({ userId: myId, partialState: { isScreenSharing: true } }));
             }
         }
    };

    const unsubRemote = webRTCService.onRemoteTrack(handleTrack);
    const unsubLocal = webRTCService.onLocalStream(handleLocal);
    
    return () => { unsubRemote(); unsubLocal(); };
  }, [dispatch]);

  // Voice channel members (excluding self, who is now in UserPanel)
  const selfId = webSocketService.getUserId();
  
  const voiceMembers = React.useMemo(() => {
      if (!voiceStates) return []; // SAFETY CHECK
      return Object.keys(voiceStates).filter(memberId => {
          const state = voiceStates[memberId];
          return state && state.channelId === activeVoiceChannelId && memberId !== selfId;
      });
  }, [voiceStates, activeVoiceChannelId, selfId]);

  return (
    <>
      {focusedStreamUser && videoStreams[focusedStreamUser] && (
          <StreamModal 
              stream={videoStreams[focusedStreamUser]} 
              username={users ? users[focusedStreamUser]?.username || focusedStreamUser : focusedStreamUser}
              onClose={() => setFocusedStreamUser(null)} 
          />
      )}
      <div className={`voice-panel glass-panel ${className || ''}`}>
        {activeVoiceChannelId ? (
            <div className="voice-channel-members">
              {voiceMembers.length > 0 ? (
                voiceMembers.map(memberId => {
                  if (!voiceStates) return null; // SAFETY CHECK
                  const state = voiceStates[memberId];
                  if (!state) return null; // SAFETY CHECK
                  
                  const isSpeaking = (state.volume || 0) > 0.005; 
                  const visualVolume = Math.max(5, (state.volume || 0) * 100); 

                  const user = users ? users[memberId] : null;
                  const displayName = user ? user.username : memberId.substring(0, 8) + '...';
                  const avatarUrl = user?.avatar;
                  const hasVideo = !!videoStreams[memberId];

                  return (
                    <div key={memberId} className={`voice-member ${isSpeaking ? 'speaking' : ''} ${state.isConnecting ? 'connecting' : ''} ${state.isDisconnected ? 'disconnected' : ''}`} onClick={() => dispatch(setUserProfileForId(memberId))}>
                      <div 
                          className="member-avatar" 
                          style={{ 
                              backgroundColor: avatarUrl ? 'transparent' : generateAvatarColor(memberId),
                              backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none',
                              backgroundSize: 'cover',
                              border: isSpeaking ? '2px solid #A56BFF' : '2px solid transparent',
                              boxShadow: isSpeaking ? `0 0 ${visualVolume}px ${visualVolume / 3}px rgba(165, 107, 255, 0.8)` : 'none' 
                          }}
                      >
                        {!avatarUrl && getInitials(displayName)}
                        {state.isMuted && <span className="voice-state-icon">🔇</span>}
                        {state.isDeafened && <span className="voice-state-icon">🎧</span>}
                      </div>
                      <div className="member-info-col" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        <span className="member-name">{displayName}</span>
                        {hasVideo && (
                            <span 
                                className="live-badge" 
                                onClick={(e) => { e.stopPropagation(); setFocusedStreamUser(memberId); }}
                            >
                                🔴 LIVE
                            </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="no-voice-members">В канале никого нет.</div>
              )}
            </div>
        ) : null}
      </div>
    </>
  );
};

export default VoicePanel;
