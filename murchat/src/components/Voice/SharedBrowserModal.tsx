import React, { useState } from 'react';
import { createPortal } from 'react-dom'; // Import createPortal
import webSocketService from '../../services/websocket';
import './SharedBrowserModal.css';

interface SharedBrowserModalProps {
    isOpen: boolean;
    onClose: () => void;
    channelId: string;
}

const SharedBrowserModal: React.FC<SharedBrowserModalProps> = ({ isOpen, onClose, channelId }) => {
    const [url, setUrl] = useState('https://google.com');

    if (!isOpen) return null;

    const handleStart = () => {
        webSocketService.startSharedBrowser(channelId, url);
        onClose();
    };

    // Use Portal to render outside the parent container
    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
                <h2>🖥 Запуск общего браузера</h2>
                
                <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>URL</label>
                    <input 
                        type="text" 
                        value={url} 
                        onChange={(e) => setUrl(e.target.value)} 
                        placeholder="https://example.com"
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--bg-tertiary)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        autoFocus
                    />
                </div>

                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} className="cancel-button" style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Отмена</button>
                    <button onClick={handleStart} className="create-button" style={{ padding: '8px 16px', background: 'var(--accent-blue)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>Запустить</button>
                </div>
            </div>
        </div>,
        document.body // Target container
    );
};

export default SharedBrowserModal;
