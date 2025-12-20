import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '../../../common/types'; // Corrected path
import type { CreateServerPayload } from '../../../common/types'; // Corrected path
import './CreateServerModal.css';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose }) => {
  const [serverName, setServerName] = useState('');
  const [isPublic, setIsPublic] = useState(true); // New state for public/private

  if (!isOpen) return null;

  const handleCreate = () => {
    if (serverName.trim()) {
      const payload: CreateServerPayload = {
        name: serverName.trim(),
        ownerId: webSocketService.getUserId() || 'unknown', // Server fills this now, but type requires it
        isPublic: isPublic, // Include public status
      };
      webSocketService.sendMessage(C2S_MSG_TYPE.CREATE_SERVER, payload);
      setServerName('');
      setIsPublic(true); // Reset state
      onClose();
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Создать сервер</h2>
        <p>Введите название вашего нового сервера.</p>
        <input
          type="text"
          placeholder="Название сервера"
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          autoFocus
        />
        <label className="checkbox-container">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Публичный сервер
          <span className="checkmark"></span>
        </label>
        <div className="modal-actions">
          <button className="cancel-button" onClick={onClose}>Отмена</button>
          <button className="create-button" onClick={handleCreate}>Создать</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CreateServerModal;
