import React from 'react';
import './StatusMenu.css';
import { useDispatch } from 'react-redux';
import { setUserStatusMenuOpen } from '../../store/slices/authSlice';
import websocketService from '../../services/websocket';
import type { User } from '@common/types';

const StatusMenu = () => {
    const dispatch = useDispatch();

    const handleStatusSelect = (status: User['status']) => {
        if (status) {
            websocketService.updateStatus(status);
            dispatch(setUserStatusMenuOpen(false));
        }
    };

    return (
        <div className="status-menu">
            <div className="status-menu-item" onClick={() => handleStatusSelect('online')}>
                <div className="status-dot online"></div>
                <span>В сети</span>
            </div>
            <div className="status-menu-item" onClick={() => handleStatusSelect('idle')}>
                <div className="status-dot idle"></div>
                <span>Не активен</span>
            </div>
            <div className="status-menu-item" onClick={() => handleStatusSelect('dnd')}>
                <div className="status-dot dnd"></div>
                <span>Не беспокоить</span>
            </div>
            <div className="status-menu-item" onClick={() => handleStatusSelect('offline')}>
                <div className="status-dot offline"></div>
                <span>Невидимка</span>
            </div>
        </div>
    );
};

export default StatusMenu;
