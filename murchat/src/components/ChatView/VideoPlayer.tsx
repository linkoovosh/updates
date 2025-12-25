import React, { useRef, useState } from 'react';
import './VideoPlayer.css';

interface VideoPlayerProps {
    url: string;
    filename: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, filename }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div 
            className="chat-video-container"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <video 
                ref={videoRef}
                src={url}
                className="chat-video-player"
                controls={isHovered}
                preload="metadata"
                poster="" // Could add a thumbnail generator later
            >
                Ваш браузер не поддерживает встроенные видео.
            </video>
            {!isHovered && (
                <div className="video-overlay-info">
                    <span className="video-filename">🎬 {filename}</span>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
