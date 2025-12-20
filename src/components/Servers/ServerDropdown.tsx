import React from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { openServerSettings, removeServer } from '../../store/slices/serverSlice';
import { setInviteModalServerId } from '../../store/slices/uiSlice';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types';

// Icons
const BoostIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3C19.5376 3 22 5.5 22 9C22 16 14.5 20 12 21.5C9.5 20 2 16 2 9C2 5.5 4.5 3 7.5 3C9.35997 3 11 4 12 5.5C13 4 14.64 3 16.5 3ZM12.9 14.3L14.8 10.4L11.6 11.6L9.8 8L11.2 12.8L8.2 11.2L10.8 16.4L12.9 14.3Z"></path></svg>;
const InviteIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>;
const SettingsIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const ChannelIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>;
const CopyIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;
const LeaveIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;

interface ServerDropdownProps {
    serverId: string;
    onClose: () => void;
    onOpenCreateChannel: () => void;
    position: { top: number; left: number };
}

const ServerDropdown: React.FC<ServerDropdownProps> = ({ serverId, onClose, onOpenCreateChannel, position }) => {
    const dispatch = useDispatch();

    const handleSettings = () => {
        dispatch(openServerSettings(serverId));
        onClose();
    };

    const handleCopyId = () => {
        if (window.electron) {
            window.electron.writeToClipboard(serverId);
        } else if (navigator.clipboard) {
            window.focus();
            navigator.clipboard.writeText(serverId).catch(err => console.error("Failed to copy ID:", err));
        }
        onClose();
    };

    const handleLeave = () => {
        if (confirm('Вы уверены, что хотите покинуть сервер?')) {
            dispatch(removeServer(serverId));
        }
        onClose();
    };

    const handleInvite = () => {
        console.log('[ServerDropdown] dispatching setInviteModalServerId:', serverId);
        dispatch(setInviteModalServerId(serverId));
        onClose();
    };

    return createPortal(
        <>
            <div className="dropdown-backdrop" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, cursor: 'default' }} />
            <div 
                className="glass-menu anim-slide-top" 
                style={{ 
                    position: 'fixed', 
                    top: position.top, 
                    left: position.left, 
                    width: '240px',
                    padding: '8px',
                    borderRadius: '12px',
                    zIndex: 10000
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="glass-menu-item" onClick={() => alert('Спасибо за поддержку! 💎')} style={{ color: '#FF73FA', fontWeight: 700 }}>
                    <span>Server Boost</span>
                    <BoostIcon />
                </div>
                
                <div className="glass-menu-separator" />
                
                <div className="glass-menu-item accent" onClick={handleInvite} style={{ color: 'var(--accent-blue)' }}>
                    <span>Пригласить людей</span>
                    <InviteIcon />
                </div>
                
                <div className="glass-menu-item" onClick={handleSettings}>
                    <span>Настройки сервера</span>
                    <SettingsIcon />
                </div>
                
                <div className="glass-menu-item" onClick={() => { onOpenCreateChannel(); onClose(); }}>
                    <span>Создать канал</span>
                    <ChannelIcon />
                </div>
                
                <div className="glass-menu-separator" />
                
                <div className="glass-menu-item" onClick={handleCopyId}>
                    <span>Скопировать ID</span>
                    <CopyIcon />
                </div>
                
                <div className="glass-menu-separator" />
                
                <div className="glass-menu-item danger" onClick={handleLeave}>
                    <span>Покинуть сервер</span>
                    <LeaveIcon />
                </div>
            </div>
        </>,
        document.body
    );
};

export default ServerDropdown;
