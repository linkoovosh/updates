import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Channel } from '@common/types';
import { TrashIcon, SettingsIcon, InfoIcon } from '../UI/Icons'; 

interface ChannelContextMenuProps {
    channel: Channel;
    position: { x: number; y: number };
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    canManage: boolean; // UPDATED: renamed and changed from isOwner
}

const ChannelContextMenu: React.FC<ChannelContextMenuProps> = ({ channel, position, onClose, onEdit, onDelete, canManage }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Small delay to prevent immediate closing from the opening click
        const timeout = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 10);
        return () => {
            clearTimeout(timeout);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Prevent menu from going off-screen
    let top = position.y;
    let left = position.x;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    if (top + 150 > window.innerHeight) top = window.innerHeight - 160;

    const handleCopyId = () => {
        if (window.electron) window.electron.writeToClipboard(channel.id);
        else navigator.clipboard.writeText(channel.id);
        onClose();
    };

    return createPortal(
        <div 
            className="glass-menu" 
            style={{ top, left }}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
        >
            {canManage && (
                <>
                    <div className="glass-menu-item" onClick={() => { onEdit(); onClose(); }}>
                        <span className="icon"><SettingsIcon /></span> Настроить канал
                    </div>
                    <div className="glass-menu-separator" />
                </>
            )}
            
            <div className="glass-menu-item" onClick={handleCopyId}>
                <span className="icon"><InfoIcon /></span> Копировать ID
            </div>

            {canManage && (
                <>
                    <div className="glass-menu-separator" />
                    <div className="glass-menu-item danger" onClick={() => { onDelete(); onClose(); }}>
                        <span className="icon"><TrashIcon /></span> Удалить канал
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

export default ChannelContextMenu;
