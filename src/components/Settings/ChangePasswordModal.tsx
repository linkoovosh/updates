import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import webSocketService from '../../services/websocket';
import { useDispatch } from 'react-redux';
import { setAuthError } from '../../store/slices/authSlice'; // To show potential errors
import './ChangePasswordModal.css'; // You'll need to create this CSS file

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const dispatch = useDispatch();

    if (!isOpen) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!oldPassword || !newPassword || !confirmNewPassword) {
            setError('Все поля обязательны.');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            setError('Новый пароль и подтверждение не совпадают.');
            return;
        }

        if (newPassword.length < 6) { // Example: minimum password length
            setError('Новый пароль должен быть не менее 6 символов.');
            return;
        }

        // Send to server
        webSocketService.changePassword(oldPassword, newPassword);
        onClose(); // Close modal after sending
        // The websocketService will handle the S2C_PASSWORD_CHANGED response
        // and force a reload/logout if successful.
    };

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
                <h2>Сменить пароль</h2>
                <form onSubmit={handleSubmit} className="change-password-form">
                    <div className="form-group">
                        <label htmlFor="oldPassword">Текущий пароль</label>
                        <input
                            type="password"
                            id="oldPassword"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="newPassword">Новый пароль</label>
                        <input
                            type="password"
                            id="newPassword"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirmNewPassword">Подтвердите новый пароль</label>
                        <input
                            type="password"
                            id="confirmNewPassword"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" className="cancel-button" onClick={onClose}>Отмена</button>
                        <button type="submit" className="primary-button">Сменить пароль</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default ChangePasswordModal;
