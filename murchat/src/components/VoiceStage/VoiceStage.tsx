import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import webSocketService from '../../services/websocket';
import { mediasoupService } from '../../services/mediasoup';
import { webRTCService } from '../../services/webrtc';
import VideoTile from './VideoTile';
import CallControls from './CallControls';
import ScreenSharePicker from '../Voice/ScreenSharePicker';
import SharedBrowserStage from '../Voice/SharedBrowserStage'; 
import { GlobeIcon, MicIcon } from '../UI/Icons'; 
import './VoiceStage.css';

const BROWSER_ID = 'shared-browser'; // Virtual ID for the browser tile

const VoiceStage: React.FC = () => {
    const activeVoiceChannelId = useSelector((state: RootState) => state.voice.activeVoiceChannelId);
    const voiceStates = useSelector((state: RootState) => state.voice.voiceStates);
    const channels = useSelector((state: RootState) => state.ui.channels);
    const sharedBrowser = useSelector((state: RootState) => state.voice.sharedBrowser); 
    const callState = useSelector((state: RootState) => state.voice.callState); // NEW
    
    // Settings
    const { screenShareResolution, screenShareFps } = useSelector((state: RootState) => state.settings);
    
    const selfId = webSocketService.getUserId();

    const participants = React.useMemo(() => {
        if (!voiceStates) return []; // NUCLEAR SAFETY

        if (activeVoiceChannelId) {
            // Server Voice Channel
            return Object.keys(voiceStates).filter(id => {
                const state = voiceStates[id];
                // Double check state existence
                return state && state.channelId === activeVoiceChannelId;
            });
        } else if (callState && (callState.isInCall || callState.isRinging)) {
            // Private DM Call
            const list = [];
            if (selfId) list.push(selfId);
            if (callState.otherUserId) list.push(callState.otherUserId);
            // Filter out IDs that don't have a voice state (except maybe self)
            return list.filter(id => id === selfId || (voiceStates && voiceStates[id]));
        }
        return [];
    }, [activeVoiceChannelId, voiceStates, callState, selfId]);
    
    // ... streams and effects ...

    // Layout Logic
    const isBrowserActive = sharedBrowser?.isActive;
    
    // SAFE FIND: ensure voiceStates exists before looking up
    const screenSharerId = participants.find(id => {
        const s = voiceStates ? voiceStates[id] : null;
        return s?.isScreenSharing;
    });
    
    const cameraUserId = participants.find(id => {
        const s = voiceStates ? voiceStates[id] : null;
        return s?.isVideoEnabled;
    });
    
    const activeFocusId = manualFocusId || screenSharerId || cameraUserId || (isBrowserActive ? BROWSER_ID : null);
    const isFocusedLayout = !!activeFocusId && (activeFocusId === BROWSER_ID || participants.includes(activeFocusId));

    const gridClass = isFocusedLayout 
        ? 'layout-focused' 
        : participants.length <= 1 ? 'grid-1' : participants.length <= 4 ? 'grid-2' : 'grid-large';

    // Handlers
    const handleTileClick = (userId: string) => {
        if (manualFocusId === userId) setManualFocusId(null);
        else setManualFocusId(userId);
    };

    const toggleScreenShare = () => {
        if (isScreenSharing) {
            mediasoupService.stopScreenShare();
        } else {
            setShowScreenPicker(true);
        }
    };

    const handleScreenShareSelect = (source: { id: string }) => {
        mediasoupService.startScreenShare(source.id, { resolution: screenShareResolution, fps: screenShareFps });
        setShowScreenPicker(false);
    };

    // Zoom & Pan Handlers
    const handleWheel = (e: React.WheelEvent) => {
        if (!isFocusedLayout) return;
        const delta = e.deltaY * -0.001;
        const newZoom = Math.min(Math.max(1, zoomLevel + delta), 5);
        setZoomLevel(newZoom);
        if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoomLevel <= 1) return;
        isDraggingRef.current = true;
        lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - lastMousePositionRef.current.x;
        const dy = e.clientY - lastMousePositionRef.current.y;
        setPanPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
    };

    return (
        <div className="voice-stage">
            <div className="voice-header">
                <h3><MicIcon /> {channelName}</h3>
                {isFocusedLayout && (
                    <div className="zoom-controls-hint">
                        <span>Колесико: Масштаб</span>
                        {zoomLevel > 1 && <span>Перетаскивание: Панорама</span>}
                        {(zoomLevel > 1 || panPosition.x !== 0) && (
                            <button onClick={() => { setZoomLevel(1); setPanPosition({x:0, y:0}); }} style={{background:'none', border:'none', color:'var(--accent-primary)', cursor:'pointer'}}>Сброс</button>
                        )}
                    </div>
                )}
            </div>
            
            {/* Removed standalone SharedBrowserStage */}

            <div className={`voice-grid ${gridClass}`}>
                {isFocusedLayout && activeFocusId ? (
                    <>
                        <div 
                            className="main-stage-area"
                            onWheel={handleWheel}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <div 
                                className="pan-zoom-container"
                                style={{ transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)` }}
                            >
                                {activeFocusId === BROWSER_ID ? (
                                    <div style={{ width: '100%', height: '100%' }}>
                                        <SharedBrowserStage />
                                    </div>
                                ) : (
                                    <VideoTile 
                                        key={activeFocusId} 
                                        userId={activeFocusId} 
                                        stream={streams[activeFocusId]} 
                                    />
                                )}
                            </div>
                        </div>
                        <div className="filmstrip-area">
                            {/* Browser Thumbnail in Filmstrip */}
                            {isBrowserActive && (
                                <div 
                                    className={`video-tile ${activeFocusId === BROWSER_ID ? 'selected' : ''}`}
                                    onClick={() => handleTileClick(BROWSER_ID)}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#000' }}
                                >
                                    <div style={{ fontSize: '2rem' }}><GlobeIcon /></div>
                                    <div className="tile-name">Общий Браузер</div>
                                </div>
                            )}
                            
                            {participants.map(userId => (
                                <VideoTile 
                                    key={userId} 
                                    userId={userId} 
                                    stream={streams[userId]}
                                    onClick={() => handleTileClick(userId)}
                                    isSelected={activeFocusId === userId}
                                />
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Grid View: Browser + Participants */}
                        {isBrowserActive && (
                             <div 
                                className={`video-tile ${activeFocusId === BROWSER_ID ? 'selected' : ''}`} 
                                style={{ minHeight: '300px', gridColumn: '1 / -1' }} // Browser takes full width in grid if possible
                                onClick={() => handleTileClick(BROWSER_ID)}
                             >
                                 <SharedBrowserStage />
                             </div>
                        )}

                        {participants.map(userId => (
                            <VideoTile 
                                key={userId} 
                                userId={userId} 
                                stream={streams[userId]}
                                onClick={() => handleTileClick(userId)} 
                            />
                        ))}
                        {participants.length === 0 && !isBrowserActive && !isScreenSharing && (
                            <div className="empty-stage-message">В канале пока никого нет... кроме вас?</div>
                        )}
                    </>
                )}
            </div>

            <CallControls 
                onToggleScreenShare={toggleScreenShare} 
                isScreenSharing={isScreenSharing} 
            />

            {showScreenPicker && (
                <ScreenSharePicker 
                    onSelect={handleScreenShareSelect} 
                    onCancel={() => setShowScreenPicker(false)} 
                />
            )}
        </div>
    );
};

export default VoiceStage;
