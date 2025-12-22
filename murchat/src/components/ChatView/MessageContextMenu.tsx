import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
// import './MessageContextMenu.css'; // REMOVED

interface MessageContextMenuProps {
    position: { x: number; y: number };
    messageId: string;
    messageContent: string;
    authorId: string;
    isAuthor: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onReply: () => void;
}

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({ 
    position, 
    messageId, 
    messageContent, 
    isAuthor, 
    onClose, 
    onEdit, 
    onDelete,
    onReply
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Adjust position to viewport
    const style = {
        top: position.y,
        left: position.x,
    };

    const handleCopyText = () => {
        navigator.clipboard.writeText(messageContent);
        onClose();
    };

    const handleCopyId = () => {
        navigator.clipboard.writeText(messageId);
        onClose();
    };

    return createPortal(
        <div className="glass-menu" style={style} ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <div className="glass-menu-item" onClick={() => { onReply(); onClose(); }}>
                <span className="icon">↩️</span> Ответить
            </div>
            <div className="glass-menu-item" onClick={handleCopyText}>
                <span className="icon">📋</span> Копировать текст
            </div>
            
            {(isAuthor) && (
                <>
                    <div className="glass-menu-separator" />
                    <div className="glass-menu-item" onClick={() => { onEdit(); onClose(); }}>
                        <span className="icon">✏️</span> Редактировать
                    </div>
                </>
            )}

            {(isAuthor) && (
                <>
                     <div className="glass-menu-separator" />
                     <div className="glass-menu-item danger" onClick={() => { onDelete(); onClose(); }}>
                        <span className="icon">🗑️</span> Удалить сообщение
                    </div>
                </>
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
