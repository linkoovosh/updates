import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import './ConnectionInfoPanel.css';

const ConnectionInfoPanel: React.FC = () => {
    const activeVoiceChannelId = useSelector((state: RootState) => state.ui.activeVoiceChannelId);
    const ping = useSelector((state: RootState) => state.ui.ping);
    const channels = useSelector((state: RootState) => state.ui.channels);
    
    const [displayPing, setDisplayPing] = React.useState(ping);
    
    // Position State - Default near bottom-left above UserPanel
    const [position, setPosition] = React.useState({ x: 19, y: 609 }); 
    const isDragging = React.useRef(false);
    const dragOffset = React.useRef({ x: 0, y: 0 });

    React.useEffect(() => {
        setDisplayPing(ping);
    }, [ping]);

    // Retrieve saved position from localStorage on mount
    React.useEffect(() => {
        const savedPos = localStorage.getItem('connectionPanelPos');
        if (savedPos) {
            try {
                const parsed = JSON.parse(savedPos);
                // Basic validation to ensure it's on screen
                if (parsed.x >= 0 && parsed.y >= 0 && parsed.x < window.innerWidth && parsed.y < window.innerHeight) {
                    setPosition(parsed);
                }
            } catch (e) {}
        }
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;
        
        // Bounds checking
        const maxX = window.innerWidth - 100; 
        const maxY = window.innerHeight - 40;
        
        setPosition({
            x: Math.min(Math.max(0, newX), maxX),
            y: Math.min(Math.max(0, newY), maxY)
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // Save position
        localStorage.setItem('connectionPanelPos', JSON.stringify(position));
    };

    if (!activeVoiceChannelId) return null;

    const channelName = channels.find(c => c.id === activeVoiceChannelId)?.name || 'Unknown Channel';
    
    let qualityClass = 'good';
    if (ping > 150) qualityClass = 'bad';
    else if (ping > 80) qualityClass = 'average';

    return (
        <div 
            className="connection-info-panel glass-panel draggable"
            style={{ 
                left: `${position.x}px`, 
                top: `${position.y}px`,
                position: 'absolute',
                zIndex: 9999, // On top of everything
                cursor: 'grab'
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="connection-header">
                <span className="voice-connected-text">Подключено</span>
                <span className="channel-name-small">{channelName}</span>
            </div>
            <div className={`connection-stats ${qualityClass}`}>
                <div className="signal-bars">
                    <div className="bar bar-1"></div>
                    <div className="bar bar-2"></div>
                    <div className="bar bar-3"></div>
                </div>
                <span className="ping-value">{displayPing} ms</span>
            </div>
        </div>
    );
};

export default ConnectionInfoPanel;
