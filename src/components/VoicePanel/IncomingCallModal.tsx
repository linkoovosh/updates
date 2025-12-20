import React from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import websocketService from '../../services/websocket';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import './IncomingCallModal.css';

const IncomingCallModal = () => {
  const { isIncoming, isRinging, otherUserData, otherUserId } = useSelector((state: RootState) => state.ui.callState);

  if (!isIncoming || !isRinging || !otherUserId) return null;

  const handleAccept = () => {
      websocketService.acceptCall(otherUserId);
  };

  const handleReject = () => {
      websocketService.rejectCall(otherUserId);
  };

  const { username, avatar } = otherUserData || { username: 'Unknown' };

  return createPortal(
    <div className="incoming-call-overlay">
        <div className="incoming-call-card glass-panel">
            <div className="caller-avatar large" style={{ 
                backgroundColor: avatar ? 'transparent' : generateAvatarColor(username),
                backgroundImage: avatar ? `url(${avatar})` : 'none',
                backgroundSize: 'cover'
            }}>
                {!avatar && getInitials(username)}
            </div>
            <h3>{username} звонит вам...</h3>
            <div className="call-actions">
                <button className="call-btn decline" onClick={handleReject}>Отклонить</button>
                <button className="call-btn accept" onClick={handleAccept}>Принять</button>
            </div>
        </div>
    </div>,
    document.body
  );
};

export default IncomingCallModal;