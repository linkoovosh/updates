
import React from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { setShowAccessDenied } from '../../store/slices/uiSlice';
import { LockIcon, ShieldIcon } from './Icons';
import './AccessDeniedModal.css';

const AccessDeniedModal: React.FC = () => {
    const dispatch = useDispatch();

    const handleClose = () => {
        dispatch(setShowAccessDenied(false));
    };

    return createPortal(
        <div className="access-denied-overlay" onClick={handleClose}>
            <div className="access-denied-modal glass-panel" onClick={(e) => e.stopPropagation()}>
                <div className="access-denied-content">
                    <div className="access-denied-icon-wrapper">
                        <div className="icon-pulse"></div>
                        <LockIcon />
                    </div>
                    
                    <h2>Доступ ограничен</h2>
                    
                    <p className="access-denied-text">
                        Вам еще не разрешали сюда заходить. 
                        Попросите <span className="highlight">администратора</span> или <span className="highlight">модератора</span> разрешить вам доступ к этому чату.
                    </p>

                    <div className="access-denied-footer">
                        <button className="holo-btn primary" onClick={handleClose}>
                            <ShieldIcon /> Понятно
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AccessDeniedModal;
