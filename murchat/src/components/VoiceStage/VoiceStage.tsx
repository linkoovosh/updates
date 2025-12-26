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
    const voiceStates = useSelector((state: RootState) => state.voice?.voiceStates || {}); // ADDED OPTIONAL CHAINING AND FALLBACK
    const channels = useSelector((state: RootState) => state.ui.channels) || [];
    const sharedBrowser = useSelector((state: RootState) => state.voice.sharedBrowser); 
    const callState = useSelector((state: RootState) => state.voice.callState);
    
    // Settings
    const { screenShareResolution, screenShareFps } = useSelector((state: RootState) => state.settings);
    
    const selfId = webSocketService.getUserId();

    const participants = React.useMemo(() => {
        try {
            if (!voiceStates) return [];
            if (activeVoiceChannelId) {
                return Object.keys(voiceStates).filter(id => {
                    const state = voiceStates[id];
                    return state && state.channelId === activeVoiceChannelId;
                });
            } else if (callState && (callState.isInCall || callState.isRinging)) {
                const list = [];
                if (selfId) list.push(selfId);
                if (callState.otherUserId) list.push(callState.otherUserId);
                return list.filter(id => id === selfId || (voiceStates && voiceStates[id]));
            }
        } catch (e) { console.error("Error in participants memo:", e); }
        return [];
    }, [activeVoiceChannelId, voiceStates, callState, selfId]);
    
    const [streams, setStreams] = React.useState<Record<string, MediaStream>>({});
    const [showScreenPicker, setShowScreenPicker] = React.useState(false);

    React.useEffect(() => { setStreams({}); }, [activeVoiceChannelId]);
    
    const isLocalScreenSharingActive = !!mediasoupService.screenProducer && !mediasoupService.screenProducer.closed;
    // ABSOLUTE SAFETY FOR isScreenSharing
    const isScreenSharing = (selfId && voiceStates && voiceStates[selfId] ? !!voiceStates[selfId]?.isScreenSharing : false) || isLocalScreenSharingActive;
    
    const [manualFocusId, setManualFocusId] = React.useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = React.useState(1);
    const [panPosition, setPanPosition] = React.useState({ x: 0, y: 0 });
    const isDraggingRef = React.useRef(false);
    const lastMousePositionRef = React.useRef({ x: 0, y: 0 });

    const channelName = React.useMemo(() => {
        if (activeVoiceChannelId) {
            return channels.find(c => c.id === activeVoiceChannelId)?.name || 'Голосовой канал';
        } else if (callState && (callState.isInCall || callState.isRinging)) {
            return `Звонок: ${callState.otherUserData?.username || 'Собеседник'}`;
        }
        return 'Голосовой чат';
    }, [activeVoiceChannelId, channels, callState]);

    React.useEffect(() => {
        const handleNewStream = ({ userId, stream, appData }: any) => {
            if (!userId) return;
            const source = appData?.source || 'mic';
            const streamKey = `${userId}:${source}`;
            setStreams(prev => ({ ...prev, [streamKey]: new MediaStream(stream.getTracks()) }));
        };
        const handleStreamClosed = ({ userId, appData }: any) => {
            if (!userId) return;
            const source = appData?.source || 'mic';
            const streamKey = `${userId}:${source}`;
            setStreams(prev => { const n = { ...prev }; delete n[streamKey]; return n; });
        };
        mediasoupService.on('newStream', handleNewStream);
        mediasoupService.on('streamClosed', handleStreamClosed);
        const unsubscribeLocal = webRTCService.onLocalStream((stream) => {
            if (selfId) setStreams(prev => ({ ...prev, [`${selfId}:mic`]: stream }));
        });
        return () => {
            mediasoupService.off('newStream', handleNewStream);
            mediasoupService.off('streamClosed', handleStreamClosed);
            unsubscribeLocal();
        };
    }, [selfId]);

    const isBrowserActive = sharedBrowser?.isActive;
    
    // SAFE FIND with optional chaining
    const screenSharerId = participants.find(id => voiceStates?.[id]?.isScreenSharing);
    const cameraUserId = participants.find(id => voiceStates?.[id]?.isVideoEnabled);
    
    // The active focus should prioritize the screen stream key if someone is sharing
    const screenFocusKey = screenSharerId ? `${screenSharerId}:screen` : null;
    const activeFocusId = manualFocusId || screenFocusKey || (cameraUserId ? `${cameraUserId}:webcam` : null) || (isBrowserActive ? BROWSER_ID : null);
    
    // Participants list for the grid should include screen shares as separate entries if focused
    const isFocusedLayout = !!activeFocusId;

    const gridClass = isFocusedLayout 
        ? 'layout-focused' 
        : participants.length <= 1 ? 'grid-1' : participants.length <= 4 ? 'grid-2' : 'grid-large';

    const handleTileClick = (id: string) => {
        if (manualFocusId === id) setManualFocusId(null);
        else setManualFocusId(id);
    };

    const toggleScreenShare = () => {
        if (isScreenSharing) mediasoupService.stopScreenShare();
        else setShowScreenPicker(true);
    };

    const handleScreenShareSelect = (source: { id: string }) => {
        mediasoupService.startScreenShare(source.id, { resolution: screenShareResolution, fps: screenShareFps });
        setShowScreenPicker(false);
    };

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
            
            <div className={`voice-grid ${gridClass}`}>
                {isFocusedLayout && activeFocusId ? (
                    <>
                        <div className="main-stage-area" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => isDraggingRef.current = false} onMouseLeave={() => isDraggingRef.current = false}>
                            <div className="pan-zoom-container" style={{ transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)` }}>
                                {activeFocusId === BROWSER_ID ? (
                                    <div style={{ width: '100%', height: '100%' }}><SharedBrowserStage /></div>
                                ) : (
                                    <VideoTile key={activeFocusId} userId={activeFocusId.split(':')[0]} stream={streams[activeFocusId]} />
                                )}
                            </div>
                        </div>
                        <div className="filmstrip-area">
                            {isBrowserActive && (
                                <div className={`video-tile ${activeFocusId === BROWSER_ID ? 'selected' : ''}`} onClick={() => handleTileClick(BROWSER_ID)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#000' }}>
                                    <div style={{ fontSize: '2rem' }}><GlobeIcon /></div>
                                    <div className="tile-name">Общий Браузер</div>
                                </div>
                            )}
                            {participants.map(id => {
                                // For each participant, we show their mic tile
                                const micKey = `${id}:mic`;
                                const screenKey = `${id}:screen`;
                                const webcamKey = `${id}:webcam`;
                                
                                return (
                                    <React.Fragment key={id}>
                                        <VideoTile userId={id} stream={streams[micKey]} onClick={() => handleTileClick(micKey)} isSelected={activeFocusId === micKey} />
                                        {streams[webcamKey] && (
                                            <VideoTile userId={id} stream={streams[webcamKey]} onClick={() => handleTileClick(webcamKey)} isSelected={activeFocusId === webcamKey} />
                                        )}
                                        {streams[screenKey] && (
                                            <VideoTile userId={id} stream={streams[screenKey]} onClick={() => handleTileClick(screenKey)} isSelected={activeFocusId === screenKey} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <>
                        {isBrowserActive && (
                             <div className={`video-tile ${activeFocusId === BROWSER_ID ? 'selected' : ''}`} style={{ minHeight: '300px', gridColumn: '1 / -1' }} onClick={() => handleTileClick(BROWSER_ID)}>
                                 <SharedBrowserStage />
                             </div>
                        )}
                        {participants.map(id => {
                            const micKey = `${id}:mic`;
                            return <VideoTile key={id} userId={id} stream={streams[micKey]} onClick={() => handleTileClick(micKey)} />;
                        })}
                        {participants.length === 0 && !isBrowserActive && !isScreenSharing && (
                            <div className="empty-stage-message">В канале пока никого нет... кроме вас?</div>
                        )}
                    </>
                )}
            </div>

            <CallControls onToggleScreenShare={toggleScreenShare} isScreenSharing={isScreenSharing} />

            {showScreenPicker && (
                <ScreenSharePicker onSelect={handleScreenShareSelect} onCancel={() => setShowScreenPicker(false)} />
            )}
        </div>
    );
};

export default VoiceStage;
