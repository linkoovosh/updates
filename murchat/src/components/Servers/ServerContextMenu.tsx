import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { openServerSettings } from '../../store/slices/serverSlice'; 
import { setInviteModalServerId } from '../../store/slices/uiSlice';
import type { Server, DeleteServerPayload } from '@common/types';
import { C2S_MSG_TYPE } from '@common/types';
import webSocketService from '../../services/websocket';
import { 
    MailIcon, SettingsIcon, PlusIcon, BellIcon, ShieldIcon, ExitIcon, TrashIcon, InfoIcon 
} from '../UI/Icons'; // IMPORT ICONS

interface ServerContextMenuProps {
  position: { x: number; y: number };
  server: Server;
  onClose: () => void;
  onCreateChannel: () => void; 
}

const ServerContextMenu: React.FC<ServerContextMenuProps> = ({ position, server, onClose, onCreateChannel }) => {
  const dispatch: AppDispatch = useDispatch();
  const menuRef = useRef<HTMLDivElement>(null);
  const { userId: myId, username, discriminator } = useSelector((state: RootState) => state.auth);
  
  const isOwner = server.ownerId === myId;
  const isLinko = username === 'Linko' && discriminator === '8885'; 
  const isAdmin = isOwner; 

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const menuWidth = 220; 
  const menuHeight = 300; 
  
  let top = position.y;
  let left = position.x;

  if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
  }
  if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
  }

  const handleDelete = () => {
      if (confirm(`Вы уверены, что хотите удалить сервер "${server.name}"? Это действие нельзя отменить.`)) {
          const payload: DeleteServerPayload = { serverId: server.id };
          webSocketService.sendMessage(C2S_MSG_TYPE.DELETE_SERVER, payload);
          onClose();
      }
  };

  const handleLeave = () => {
      webSocketService.leaveServer(server.id);
      onClose();
  };

  const handleCopyId = () => {
      if (window.electron) {
          window.electron.writeToClipboard(server.id);
      } else {
          navigator.clipboard.writeText(server.id).catch(err => {
              console.error('Failed to copy ID:', err);
          });
      }
      onClose();
  };

  const handleInvite = () => {
      console.log('[ServerContextMenu] dispatching setInviteModalServerId:', server.id);
      dispatch(setInviteModalServerId(server.id));
      onClose();
  };

  return createPortal(
    <div 
      className="glass-menu"
      style={{ top, left }}
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="glass-menu-item" onClick={handleInvite}>
        <span className="icon"><MailIcon /></span> Пригласить людей
      </div>

      {isAdmin && <div className="glass-menu-item" onClick={() => { dispatch(openServerSettings(server.id)); onClose(); }}><span className="icon"><SettingsIcon /></span> Настройки сервера</div>}
      {isAdmin && <div className="glass-menu-item" onClick={() => { onCreateChannel(); onClose(); }}><span className="icon"><PlusIcon /></span> Создать канал</div>}

      <div className="glass-menu-separator" />

      <div className="glass-menu-item">
        <span className="icon"><BellIcon /></span> Настройки уведомлений
      </div>
      <div className="glass-menu-item">
        <span className="icon"><ShieldIcon /></span> Настройки приватности
      </div>

      <div className="glass-menu-separator" />

      {!isOwner && !isLinko && (
          <div className="glass-menu-item danger" onClick={handleLeave}>
              <span className="icon"><ExitIcon /></span> Выйти с сервера
          </div>
      )}
      
      {(isOwner || isLinko) && (
          <div className="glass-menu-item danger" onClick={handleDelete}>
              <span className="icon"><TrashIcon /></span> Удалить сервер
          </div>
      )}
      
      <div className="glass-menu-separator" />
      <div className="glass-menu-item" onClick={handleCopyId}>
         <span className="icon"><InfoIcon /></span> Копировать ID
      </div>
    </div>,
    document.body
  );
};

export default ServerContextMenu;