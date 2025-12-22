import React from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux'; // NEW
import type { RootState } from '../../store'; // NEW
import './ChangelogModal.css';

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
    version: string;
    changes: string[];
    title?: string;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose, version, changes, title }) => {
    const username = useSelector((state: RootState) => state.ui.username); // NEW

    if (!isOpen) return null;

    return createPortal(
        <div className="changelog-overlay" onClick={onClose}>
            <div className="changelog-card" onClick={e => e.stopPropagation()}>
                <div className="changelog-header">
                    <div className="changelog-title-row">
                        <h2>Что нового</h2>
                        <span className="version-badge">v{version}</span>
                    </div>
                    <div className="changelog-subtitle">
                        {username ? `Привет, ${username}! ` : ''}{title}
                    </div>
                    <button className="close-changelog-btn" onClick={onClose}>&times;</button>
                </div>
                
                <div className="changelog-content">
                    <ul>
                        {changes.map((change, index) => (
                            <li key={index}>{change}</li>
                        ))}
                    </ul>
                </div>

                <div className="changelog-footer">
                    <button className="awesome-btn" onClick={onClose}>Понятно</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ChangelogModal;
