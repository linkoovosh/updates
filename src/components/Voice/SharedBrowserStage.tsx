import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import webSocketService from '../../services/websocket';
import { mediasoupService } from '../../services/mediasoup';
import './SharedBrowserStage.css';

// Add webview type definition for React
declare global {
    namespace JSX {
        interface IntrinsicElements {
            webview: any;
        }
    }
}

const SharedBrowserStage: React.FC = () => {
    const sharedBrowser = useSelector((state: RootState) => state.voice.sharedBrowser);
    const userId = useSelector((state: RootState) => state.auth.userId);
    const videoRef = useRef<HTMLVideoElement>(null);
    const webviewRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    
    const isOwner = sharedBrowser.ownerId === userId;

    // --- OWNER LOGIC ---
    useEffect(() => {
        if (!sharedBrowser.isActive || !isOwner) return;

        console.log("[SharedBrowserStage] Owner active. Attempting auto-share...");
        
        const startSharing = async () => {
            // Wait for UI to render
            await new Promise(r => setTimeout(r, 1000));
            
            try {
                if (!window.electron) {
                    console.warn("Electron API not available");
                    return;
                }
                
                // New Seamless Capture Logic
                const sourceId = await window.electron.getCurrentWindowSourceId();
                console.log("[SharedBrowserStage] Auto-detected source ID:", sourceId);

                if (sourceId) {
                    mediasoupService.startBrowserShare(sourceId, { resolution: '720p', fps: 30 });
                } else {
                    // Fallback to searching by name manually
                    const sources = await window.electron.getScreenSources();
                    const appSource = sources?.find(s => s.name.includes("MurCHAT")); 
                    if (appSource) {
                        console.log("[SharedBrowserStage] Found MurCHAT window by name, sharing:", appSource.id);
                        mediasoupService.startBrowserShare(appSource.id, { resolution: '720p', fps: 30 });
                    } else {
                        console.warn("[SharedBrowserStage] MurCHAT window not found.");
                        alert("Не удалось автоматически захватить окно. Пожалуйста, запустите трансляцию вручную.");
                    }
                }
            } catch (e) {
                console.error("Failed to auto-share:", e);
            }
        };
        
        // Enable auto-start
        startSharing(); 

        // Listen for remote input
        const handleInput = (payload: any) => {
            if (webviewRef.current) {
                // Apply input to webview
                // console.log("Applying input:", payload);
                const webview = webviewRef.current;
                
                // Scale coordinates (Remote 1280x720 -> Local Webview Size)
                // We need to know remote reference size. Assume 1280x720 standard.
                // And local size.
                
                const rect = webview.getBoundingClientRect();
                const scaleX = rect.width / 1280;
                const scaleY = rect.height / 720;

                try {
                    switch (payload.inputType) {
                        case 'mousemove':
                            webview.sendInputEvent({ 
                                type: 'mouseMove', 
                                x: payload.x * scaleX, 
                                y: payload.y * scaleY 
                            });
                            break;
                        case 'mousedown':
                            webview.sendInputEvent({ 
                                type: 'mouseDown', 
                                x: payload.x * scaleX, 
                                y: payload.y * scaleY,
                                button: 'left',
                                clickCount: 1
                            });
                            break;
                        case 'mouseup':
                            webview.sendInputEvent({ 
                                type: 'mouseUp', 
                                x: payload.x * scaleX, 
                                y: payload.y * scaleY,
                                button: 'left',
                                clickCount: 1
                            });
                            break;
                        case 'click':
                            // Click is composite, maybe just down/up is enough
                            break;
                        case 'keydown':
                            webview.sendInputEvent({ type: 'keyDown', keyCode: payload.key });
                            break;
                        case 'keyup':
                            webview.sendInputEvent({ type: 'keyUp', keyCode: payload.key });
                            break;
                        case 'scroll':
                             webview.sendInputEvent({ type: 'mouseWheel', deltaY: payload.deltaY });
                             break;
                    }
                } catch (err) {
                    console.error("Failed to send input to webview:", err);
                }
            }
        };

        const unsubscribe = webSocketService.receive('SHARED_BROWSER_INPUT', handleInput);
        return () => { unsubscribe(); };

    }, [sharedBrowser.isActive, isOwner]);


    // --- VIEWER LOGIC ---
    useEffect(() => {
        if (!sharedBrowser.isActive || isOwner) {
            setStream(null);
            return;
        }

        // Subscribe to Owner's Screen Share
        const unsubTrack = mediasoupService.onScreenShareTrack((track, peerId) => {
             if (peerId === sharedBrowser.ownerId) {
                 setStream(new MediaStream([track]));
             }
        });

        return () => { unsubTrack(); };

    }, [sharedBrowser.isActive, isOwner, sharedBrowser.ownerId]);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    if (!sharedBrowser.isActive) return null;

    // --- INPUT SENDING (Viewer) ---
    const sendInput = (type: string, data: any) => {
        const channelId = webSocketService.getState()?.voice.activeVoiceChannelId;
        if (!channelId) return;

        webSocketService.sendSharedBrowserInput({
            channelId,
            inputType: type as any,
            ...data
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!videoRef.current) return;
        const rect = videoRef.current.getBoundingClientRect();
        // Calculate relative 1280x720 coords
        const scaleX = 1280 / rect.width;
        const scaleY = 720 / rect.height;
        sendInput('mousemove', { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY });
    };

    // ... (Other input handlers similar to before) ...

    return (
        <div className="shared-browser-stage glass-panel">
            <div className="browser-header">
                <div className="browser-info">
                    <span>🌐 Общий браузер {isOwner ? '(Владелец)' : '(Просмотр)'}</span>
                    <span className="browser-url">{sharedBrowser.url}</span>
                </div>
                {isOwner && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="close-browser-btn" style={{ background: '#3BA55D' }} onClick={() => {
                             // Trigger manual screen share picker (reuse logic from UserPanel if possible, or direct)
                             // For now, simple alert or try auto-share again
                             const start = async () => {
                                 const sources = await window.electron?.getScreenSources();
                                 const appSource = sources?.find(s => s.name.includes("MurCHAT")); 
                                 if (appSource) mediasoupService.startBrowserShare(appSource.id);
                                 else alert("Окно не найдено");
                             };
                             start();
                        }}>
                            📡 Транслировать
                        </button>
                        <button className="close-browser-btn" onClick={() => {
                             // Immediately stop stream locally
                             mediasoupService.stopBrowserShare();
                             
                             const channelId = webSocketService.getState()?.voice.activeVoiceChannelId;
                             if (channelId) webSocketService.stopSharedBrowser(channelId);
                        }}>
                            ⏹ Завершить
                        </button>
                    </div>
                )}
            </div>
            
            <div className="browser-video-container" ref={containerRef} tabIndex={0}>
                {isOwner ? (
                    <webview 
                        ref={webviewRef}
                        src={sharedBrowser.url}
                        style={{ width: '100%', height: '100%' }}
                        allowpopups="true" // Optional
                        // Add preload if needed for bridging
                    />
                ) : (
                    <>
                        <video 
                            ref={videoRef} 
                            className="browser-video" 
                            autoPlay 
                            playsInline 
                            muted
                        />
                        <div 
                            className="control-overlay"
                            onMouseMove={handleMouseMove}
                            onMouseDown={(e) => {
                                // ... Logic for clicks
                                const rect = e.currentTarget.getBoundingClientRect();
                                const scaleX = 1280 / rect.width;
                                const scaleY = 720 / rect.height;
                                sendInput('mousedown', { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY });
                            }}
                            onMouseUp={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const scaleX = 1280 / rect.width;
                                const scaleY = 720 / rect.height;
                                sendInput('mouseup', { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY });
                            }}
                            // ... keydown etc
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default SharedBrowserStage;
