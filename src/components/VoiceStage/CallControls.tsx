import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updateVoiceState, clearVoiceChannel } from '../../store/slices/voiceSlice';
import webSocketService from '../../services/websocket';
import { mediasoupService } from '../../services/mediasoup';
import { webRTCService } from '../../services/webrtc'; // FIXED: Missing import
import type { RootState, AppDispatch } from '../../store';
import SharedBrowserModal from '../Voice/SharedBrowserModal'; 
import './VoiceStage.css';

// Icons
const MicIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>);
const MicOffIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>);
const MonitorIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>);
const MonitorOffIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>);
const GlobeIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>);
// New Phone Off Icon
const PhoneOffIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"></line></svg>);
const VideoIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>);

interface CallControlsProps {
    onToggleScreenShare: () => void;
    isScreenSharing: boolean;
}

const CallControls: React.FC<CallControlsProps> = ({ onToggleScreenShare, isScreenSharing }) => {
    const dispatch: AppDispatch = useDispatch();
    const selfId = webSocketService.getUserId();
    const voiceStates = useSelector((state: RootState) => state.voice.voiceStates);
    const activeVoiceChannelId = useSelector((state: RootState) => state.voice.activeVoiceChannelId);
    const sharedBrowser = useSelector((state: RootState) => state.voice.sharedBrowser); // NEW
    
    const [showBrowserModal, setShowSharedBrowserModal] = React.useState(false); // NEW

    const selfState = selfId ? voiceStates[selfId] : null;

    const handleDisconnect = () => {
        console.log("CallControls: Disconnect clicked. Active Channel:", activeVoiceChannelId);
        if (activeVoiceChannelId) {
            webSocketService.leaveVoiceChannel(activeVoiceChannelId);
            dispatch(clearVoiceChannel());
        } else {
            console.warn("CallControls: No active voice channel to leave.");
        }
    };

    const handleToggleMute = () => {
        if (selfId && selfState) {
            const newMuteState = !selfState.isMuted;
            dispatch(updateVoiceState({ userId: selfId, partialState: { isMuted: newMuteState } }));
            mediasoupService.muteAudio(newMuteState);
            webRTCService.muteLocalStream(newMuteState); // Mute local viz/P2P
        }
    };

    const handleToggleSharedBrowser = () => {
        if (!activeVoiceChannelId) return;

        if (sharedBrowser.isActive) {
            if (sharedBrowser.ownerId === selfId) {
                if (confirm('Остановить общий браузер?')) {
                    webSocketService.stopSharedBrowser(activeVoiceChannelId);
                }
            } else {
                alert('Браузер уже запущен другим пользователем.');
            }
        } else {
            // If screen sharing is active, stop it first
            if (isScreenSharing) {
                onToggleScreenShare(); // Toggle off
            }
            setShowSharedBrowserModal(true);
        }
    };

    // Camera placeholder for now
    const handleToggleCamera = () => {
        alert("Видеокамера будет доступна в следующем обновлении!");
    };

    return (
        <div className="call-controls-container">
            <div className="call-controls">
                <button 
                    className={`call-control-btn ${selfState?.isMuted ? 'active' : ''}`} 
                    onClick={handleToggleMute}
                    title="Микрофон"
                >
                    {selfState?.isMuted ? <MicOffIcon /> : <MicIcon />}
                </button>
                
                <button 
                    className="call-control-btn" 
                    onClick={handleToggleCamera}
                    title="Камера"
                >
                    <VideoIcon />
                </button>

                <button 
                    className={`call-control-btn ${isScreenSharing ? 'active-green' : ''}`} 
                    onClick={onToggleScreenShare}
                    title="Демонстрация экрана"
                >
                    {isScreenSharing ? <MonitorOffIcon /> : <MonitorIcon />}
                </button>

                <button 
                    className={`call-control-btn ${sharedBrowser.isActive ? 'active-green' : ''}`} 
                    onClick={handleToggleSharedBrowser}
                    title={sharedBrowser.isActive ? "Браузер запущен" : "Запустить общий браузер"}
                >
                    <GlobeIcon />
                </button>
                
                <button 
                    className="call-control-btn disconnect-btn" 
                    onClick={handleDisconnect}
                    title="Отключиться"
                >
                    <PhoneOffIcon />
                </button>
            </div>
            
            <SharedBrowserModal 
                isOpen={showBrowserModal} 
                onClose={() => setShowSharedBrowserModal(false)} 
                channelId={activeVoiceChannelId || ''} 
            />
        </div>
    );
};

export default CallControls;