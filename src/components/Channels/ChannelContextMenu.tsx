import React from 'react';
import { createPortal } from 'react-dom';
import type { Channel } from '@common/types';
// import './ChannelContextMenu.css'; // REMOVED

// Icons (Stroke based)
const EditIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const TrashIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>;
const CopyIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;

interface ChannelContextMenuProps {
    channel: Channel;
    position: { x: number; y: number };
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    isOwner: boolean; // Only owner can edit/delete for now
}

const ChannelContextMenu: React.FC<ChannelContextMenuProps> = ({ channel, position, onClose, onEdit, onDelete, isOwner }) => {
    
    const handleCopyId = () => {
        if (window.electron) window.electron.writeToClipboard(channel.id);
        else if (navigator.clipboard) navigator.clipboard.writeText(channel.id);
        else prompt("ID Канала:", channel.id);
        onClose();
    };

    return createPortal(
        <>
            <div className="dropdown-backdrop" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, cursor: 'default' }} />
            <div 
                className="glass-menu" 
                style={{ top: position.y, left: position.x }}
                onClick={(e) => e.stopPropagation()}
            >
                {isOwner && (
                    <>
                        <div className="glass-menu-item" onClick={() => { onEdit(); onClose(); }}>
                            <span style={{ flex: 1 }}>Настроить канал</span>
                            <EditIcon />
                        </div>
                        <div className="glass-menu-separator" />
                    </>
                )}
                
                <div className="glass-menu-item" onClick={handleCopyId}>
                    <span style={{ flex: 1 }}>Скопировать ID</span>
                    <CopyIcon />
                </div>

                {isOwner && (
                    <>
                        <div className="glass-menu-separator" />
                        <div className="glass-menu-item danger" onClick={() => { onDelete(); onClose(); }}>
                            <span style={{ flex: 1 }}>Удалить канал</span>
                            <TrashIcon />
                        </div>
                    </>
                )}
            </div>
        </>,
        document.body
    );
};

export default ChannelContextMenu;
