import React, { useState, useEffect } from 'react';
import './VoiceStage.css';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import VideoTile from './VideoTile';
import CallControls from './CallControls';
import SharedBrowserStage from '../Voice/SharedBrowserStage';

const VoiceStage: React.FC = () => {
  const activeVoiceChannelId = useSelector((state: RootState) => state.voice.activeVoiceChannelId);
  const voiceStates = useSelector((state: RootState) => state.voice.voiceStates || {});
  const [cinemaMode, setCinemaMode] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Safety: get member IDs that actually exist in voiceStates
  const memberIds = Object.keys(voiceStates).filter(id => {
      const state = voiceStates[id];
      return state && state.channelId === activeVoiceChannelId;
  });

  const sharedBrowser = useSelector((state: RootState) => state.voice.sharedBrowser);

  // If we have a shared browser, we prioritize it
  const hasBrowser = sharedBrowser.isActive;

  if (!activeVoiceChannelId && !hasBrowser) return null;

  const handleToggleCinema = () => setCinemaMode(!cinemaMode);
  const handleFocusTile = (id: string | null) => setFocusedId(id === focusedId ? null : id);

  return (
    <div className={`voice-stage ${cinemaMode ? 'cinema-mode' : ''} ${focusedId || hasBrowser ? 'layout-focused' : ''}`}>
      <div className="voice-stage-content">
        {hasBrowser ? (
          <div className="main-focused-area">
             <SharedBrowserStage />
          </div>
        ) : focusedId ? (
          <div className="main-focused-area">
             <VideoTile 
                userId={focusedId} 
                isFocused={true} 
                onFocus={() => handleFocusTile(null)} 
             />
          </div>
        ) : null}

        <div className="video-grid">
          {memberIds.map(id => (
            id !== focusedId && (
              <VideoTile 
                key={id} 
                userId={id} 
                onFocus={() => handleFocusTile(id)} 
              />
            )
          ))}
        </div>
      </div>
      <CallControls onToggleCinema={handleToggleCinema} cinemaMode={cinemaMode} />
    </div>
  );
};

export default VoiceStage;