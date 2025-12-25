import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TrashIcon, ExitIcon, MicIcon, UserIcon, MailIcon, CheckIcon } from '../UI/Icons'; 
import './MessageContextMenu.css'; // IMPORT STYLES

interface MessageContextMenuProps {
    position: { x: number; y: number };
    messageId: string;
    messageContent: string;
    authorId: string;
    isAuthor: boolean;
    canManage: boolean;
    isPinned: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onReply: () => void;
    onPin: () => void;
}

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({ 
    position, 
    messageId, 
    messageContent, 
    isAuthor, 
    canManage,
    isPinned,
    onClose, 
    onEdit, 
    onDelete,
    onReply,
    onPin
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Add a small delay to prevent immediate close if the event that opened the menu bubbles up
        const timeout = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 10);
        
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Adjust position to viewport to prevent going off-screen
    let top = position.y;
    let left = position.x;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    if (top + 250 > window.innerHeight) top = window.innerHeight - 260;

    const style = { top, left };

    const handleCopyText = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(messageContent);
        onClose();
    };

    const handleCopyId = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(messageId);
        onClose();
    };

    return createPortal(
        <div className="glass-menu" style={style} ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <div className="glass-menu-item" onClick={(e) => { e.stopPropagation(); onReply(); onClose(); }}>
                <span className="icon">↩️</span> Ответить
            </div>
            
            {(isAuthor || canManage) && (
                <div className="glass-menu-item" onClick={(e) => { e.stopPropagation(); onPin(); onClose(); }}>
                    <span className="icon">📌</span> {isPinned ? 'Открепить' : 'Закрепить'}
                </div>
            )}

            <div className="glass-menu-item" onClick={handleCopyText}>
                <span className="icon">📋</span> Копировать текст
            </div>
            
            {isAuthor && (
                <>
                    <div className="glass-menu-separator" />
                    <div className="glass-menu-item" onClick={(e) => { e.stopPropagation(); onEdit(); onClose(); }}>
                        <span className="icon">✏️</span> Редактировать
                    </div>
                </>
            )}

            {(isAuthor || canManage) && (
                <div className="glass-menu-item danger" onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}>
                    <span className="icon"><TrashIcon /></span> Удалить сообщение
                </div>
            )}
            
            <div className="glass-menu-separator" />
            <div className="glass-menu-item" onClick={handleCopyId}>
                <span className="icon">🆔</span> Копировать ID
            </div>
        </div>,
        document.body
    );
};

export default MessageContextMenu;
