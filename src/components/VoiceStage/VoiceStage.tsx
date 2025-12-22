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

    // FIXED PARTICIPANTS LOGIC
    const participants = React.useMemo(() => {
        if (activeVoiceChannelId) {
            // Server Voice Channel
            return Object.keys(voiceStates).filter(id => {
                const state = voiceStates[id];
                return state.channelId === activeVoiceChannelId;
            });
        } else if (callState.isInCall || callState.isRinging) {
            // Private DM Call
            const list = [];
            if (selfId) list.push(selfId);
            if (callState.otherUserId) list.push(callState.otherUserId);
            return list;
        }
        return [];
    }, [activeVoiceChannelId, voiceStates, callState, selfId]);
    
    // State for video streams
    const [streams, setStreams] = React.useState<Record<string, MediaStream>>({});
    const [showScreenPicker, setShowScreenPicker] = React.useState(false);

    // Clear streams when channel changes to avoid ghost tiles
    React.useEffect(() => {
        setStreams({});
    }, [activeVoiceChannelId]);
    
    // Check both Redux state AND local producer existence for instant feedback
    const isLocalScreenSharingActive = !!mediasoupService.screenProducer && !mediasoupService.screenProducer.closed;
    const isScreenSharing = (selfId ? !!voiceStates[selfId]?.isScreenSharing : false) || isLocalScreenSharingActive;
    
    // New: Manual Focus & Zoom State
    const [manualFocusId, setManualFocusId] = React.useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = React.useState(1);
    const [panPosition, setPanPosition] = React.useState({ x: 0, y: 0 });
    const isDraggingRef = React.useRef(false);
    const lastMousePositionRef = React.useRef({ x: 0, y: 0 });

    // FIXED NAME LOGIC
    const channelName = React.useMemo(() => {
        if (activeVoiceChannelId) {
            return channels.find(c => c.id === activeVoiceChannelId)?.name || 'Голосовой канал';
        } else if (callState.isInCall || callState.isRinging) {
            return `Звонок: ${callState.otherUserData?.username || 'Собеседник'}`;
        }
        return 'Голосовой чат';
    }, [activeVoiceChannelId, channels, callState]);

    // Effects for Mediasoup
    React.useEffect(() => {
        const handleNewStream = ({ userId, stream, appData }: { userId: string; stream: MediaStream; appData?: any }) => {
            const hasVideo = stream.getVideoTracks().length > 0;
            const isScreen = appData?.source === 'screen' || appData?.source === 'browser';
            
            console.log(`[VoiceStage] New stream for ${userId}, source: ${appData?.source}, hasVideo: ${hasVideo}`);
            
            setStreams(prev => {
                const existingStream = prev[userId];
                // Wrap in new MediaStream to ensure React detects the change and re-runs effects
                const newStreamObj = new MediaStream(stream.getTracks());

                // FORCE replace if the new stream is a screen share
                if (isScreen) {
                    console.log(`[VoiceStage] New stream is SCREEN SHARE for ${userId}. Forcing replacement.`);
                    return { ...prev, [userId]: newStreamObj };
                }

                // If we already have a stream with video, don't let an audio-only stream overwrite it
                if (existingStream && existingStream.getVideoTracks().length > 0 && !hasVideo) {
                    console.log(`[VoiceStage] Keeping existing video stream for ${userId}, ignoring new audio-only stream.`);
                    return prev;
                }
                
                return { ...prev, [userId]: newStreamObj };
            });
        };

        const handleStreamClosed = ({ userId, appData }: { userId: string; appData?: any }) => {
            console.log(`[VoiceStage] Stream closed for ${userId}, source: ${appData?.source}`);
            // Only remove if it was the main stream or we have no more producers
            // For now, simple removal is fine, Mediasoup will resync if needed
            setStreams(prev => {
                const newStreams = { ...prev };
                delete newStreams[userId];
                return newStreams;
            });
        };

        mediasoupService.on('newStream', handleNewStream);
        mediasoupService.on('streamClosed', handleStreamClosed);

        // --- Handle Local Stream ---
        const handleLocalStream = (stream: MediaStream) => {
            console.log(`[VoiceStage] Handling local stream`);
            if (selfId) {
                setStreams(prev => ({ ...prev, [selfId]: stream }));
            }
        };
        const unsubscribeLocal = webRTCService.onLocalStream(handleLocalStream);

        // Load existing streams
        const currentStreams: Record<string, MediaStream> = {};
        mediasoupService.consumers.forEach((consumer, userId) => {
            if (consumer.track.kind === 'video') {
                currentStreams[userId] = new MediaStream([consumer.track]);
            }
        });
        setStreams(currentStreams);

        return () => {
            mediasoupService.off('newStream', handleNewStream);
            mediasoupService.off('streamClosed', handleStreamClosed);
            unsubscribeLocal();
        };
    }, [selfId]);

    // Layout Logic
    const isBrowserActive = sharedBrowser?.isActive;
    const screenSharerId = participants.find(id => voiceStates[id]?.isScreenSharing);
    const cameraUserId = participants.find(id => voiceStates[id]?.isVideoEnabled); // NEW
    
    const activeFocusId = manualFocusId || screenSharerId || cameraUserId || (isBrowserActive ? BROWSER_ID : null);
    const isFocusedLayout = !!activeFocusId;

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
