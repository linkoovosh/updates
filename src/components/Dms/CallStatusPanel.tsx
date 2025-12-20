import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import websocketService from '../../services/websocket';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import './CallStatusPanel.css';

const CallStatusPanel = () => {
    const { isInCall, isRinging, isIncoming, otherUserData, otherUserId } = useSelector((state: RootState) => state.ui.callState);
    const { username: myName, avatar: myAvatar } = useSelector((state: RootState) => state.ui);

    // If it's incoming ringing, the modal handles it. We only show this for outgoing ringing or active calls.
    if (!isInCall && !isRinging) return null;
    if (isIncoming && isRinging) return null;

    const handleHangup = () => {
        if (otherUserId) {
            websocketService.hangupCall(otherUserId);
        }
    };

    const statusText = isRinging ? "Звоним..." : "В разговоре";
    const { username, avatar } = otherUserData || { username: 'Unknown' };

    return (
        <div className="call-status-panel">
            <div className="call-avatars">
                 {/* My Avatar */}
                 <div className="call-avatar-wrapper">
                    <div className="call-avatar" style={{ backgroundImage: myAvatar ? `url(${myAvatar})` : 'none', backgroundColor: generateAvatarColor(myName || '') }}>
                        {!myAvatar && getInitials(myName || '')}
                    </div>
                    <span>Вы</span>
                 </div>
                 
                 <div className="call-status-center">
                    <div className="call-status-pulse"></div>
                    <span className="call-status-label">{statusText}</span>
                 </div>

                 {/* Their Avatar */}
                 <div className="call-avatar-wrapper">
                    <div className="call-avatar" style={{ backgroundImage: avatar ? `url(${avatar})` : 'none', backgroundColor: generateAvatarColor(username) }}>
                        {!avatar && getInitials(username)}
                    </div>
                    <span>{username}</span>
                 </div>
            </div>
            <div className="call-controls">
                <button className="hangup-btn" onClick={handleHangup}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>
                </button>
            </div>
        </div>
    );
}
export default CallStatusPanel;