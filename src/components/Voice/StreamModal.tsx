import React, { useEffect, useRef } from 'react';
import './StreamModal.css';

interface StreamModalProps {
    stream: MediaStream;
    onClose: () => void;
    username: string;
}

const StreamModal: React.FC<StreamModalProps> = ({ stream, onClose, username }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("StreamModal play error:", e));
        }
    }, [stream]);

    return (
        <div className="stream-modal-overlay" onClick={onClose}>
            <div className="stream-modal-content" onClick={e => e.stopPropagation()}>
                <div className="stream-header">
                    <span>{username} is sharing their screen</span>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="video-container">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        controls={false} // Custom controls if needed
                    />
                </div>
            </div>
        </div>
    );
};

export default StreamModal;
