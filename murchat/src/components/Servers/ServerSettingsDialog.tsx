import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { C2S_MSG_TYPE } from "../../../common/types";
import type { Server, UpdateServerPayload, DeleteServerPayload, UpdateServerProfilePayload } from "../../../common/types";
import webSocketService from "../../services/websocket";
import RoleSettings from './RoleSettings';
import MemberSettings from './MemberSettings';
import { setInviteModalServerId } from '../../store/slices/uiSlice';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS, hasPermission } from '../../../common/permissions';
import { 
    InfoIcon, ShieldIcon, UserIcon, MailIcon, LockIcon, TrashIcon, CheckIcon 
} from '../UI/Icons'; // IMPORT ICONS
import './ServerSettingsDialog.css';

const PUBLIC_SERVER_ID_CLIENT = 'public-default-server'; 

interface ServerSettingsDialogProps {
  serverId: string;
  onClose: () => void;
}

type SettingsTab = 'overview' | 'roles' | 'members' | 'invites' | 'safety';

const ServerSettingsDialog: React.FC<ServerSettingsDialogProps> = ({ serverId, onClose }) => {
  console.log('--- SERVER SETTINGS RENDERED: VERSION 2.2 (PERMISSIONS) ---');
  
  const dispatch = useDispatch();
  
  // Stable selectors to prevent re-render loops
  const servers = useSelector((state: RootState) => state.server.servers);
  const allChannels = useSelector((state: RootState) => state.ui.channels);
  const currentUser = useSelector((state: RootState) => state.auth.userId);
  const perms = usePermissions(serverId);
  
  const server = useMemo(() => servers.find(s => s.id === serverId), [servers, serverId]);
  const serverChannels = useMemo(() => 
    allChannels.filter(c => c.serverId === serverId && c.type === 'text'), 
    [allChannels, serverId]
  );

  const [activeTab, setActiveTab] = useState<SettingsTab>('overview');
  const [serverName, setServerName] = useState('');
  const [serverDescription, setServerDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [activeAvatar, setActiveAvatar] = useState<string | null>(null);
  const [defaultAvatar, setDefaultAvatar] = useState<string | null>(null);
  const [serverBanner, setServerBanner] = useState<string | null>(null);
  const [systemChannelId, setSystemChannelId] = useState<string | null>(null);
  const [verificationLevel, setVerificationLevel] = useState<number>(0);

  // Sync state only when server object actually changes
  useEffect(() => {
      if (server) {
          setServerName(server.name || '');
          setServerDescription(server.description || '');
          setIsPublic(server.isPublic ?? true);
          setSystemChannelId(server.systemChannelId || null);
          setVerificationLevel(server.verificationLevel || 0);
          setServerBanner(server.banner || null);
          setActiveAvatar(server.avatar_active || null);
          setDefaultAvatar(server.avatar_default || null);
      }
  }, [server]);

  if (!server) return null;

  const isOwner = currentUser === server.ownerId;
  const canManageServer = isOwner || hasPermission(perms, PERMISSIONS.MANAGE_SERVER);
  const canManageRoles = isOwner || hasPermission(perms, PERMISSIONS.MANAGE_ROLES);
  // Member management usually requires KICK/BAN or general management
  const canManageMembers = isOwner || hasPermission(perms, PERMISSIONS.KICK_MEMBERS) || hasPermission(perms, PERMISSIONS.BAN_MEMBERS) || hasPermission(perms, PERMISSIONS.MANAGE_ROLES); 
  const canCreateInvite = isOwner || hasPermission(perms, PERMISSIONS.CREATE_INVITE);
  const isPublicDefaultServer = serverId === PUBLIC_SERVER_ID_CLIENT;

  const handleSaveOverview = () => {
      if (canManageServer) {
          const payload: UpdateServerPayload = {
              serverId: server.id,
              name: serverName.trim(),
              description: serverDescription.trim(),
              isPublic: isPublic,
              systemChannelId: systemChannelId,
              verificationLevel: verificationLevel,
              banner: serverBanner || undefined
          };
          console.log('[ServerSettingsDialog] Saving overview. Payload:', payload);
          webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_SERVER, payload);
          onClose();
      }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('authToken');
      try {
          const response = await fetch('https://89.221.20.26:22822/upload', {
              method: 'POST',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              body: formData,
          });
          if (!response.ok) throw new Error('Upload failed');
          const data = await response.json();
          return data.url.startsWith('http') ? data.url : `https://89.221.20.26:22822${data.url}`;
      } catch (error) {
          console.error('File upload error:', error);
          return null;
      }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'default' | 'active' | 'banner') => {
      if (e.target.files && e.target.files[0]) {
          const url = await uploadFile(e.target.files[0]);
          if (url) {
              if (type === 'banner') {
                  setServerBanner(url);
              } else {
                  const payload: UpdateServerProfilePayload = {
                      serverId: serverId,
                      avatar_default: type === 'default' ? url : undefined,
                      avatar_active: type === 'active' ? url : undefined
                  };
                  webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_SERVER_PROFILE, payload);
                  if (type === 'default') setDefaultAvatar(url);
                  else setActiveAvatar(url);
              }
          }
      }
  };

  const renderSidebarItem = (tab: SettingsTab, label: string, icon?: React.ReactNode) => (
    <div className={`settings-tab-item ${activeTab === tab ? 'active' : ''}`} onClick={() => {
        if (tab === 'invites') {
            dispatch(setInviteModalServerId(serverId));
            onClose();
        } else {
            setActiveTab(tab);
        }
    }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{icon} {label}</span>
    </div>
  );

  return (
    <div className="server-settings-overlay">
      <div className="server-settings-modal anim-scale-in">
        <div className="server-settings-sidebar">
            <div className="server-settings-sidebar-header">{server.name}</div>
            
            <div className="sidebar-group-label">Сервер</div>
            {renderSidebarItem('overview', 'Обзор', <InfoIcon />)}
            
            {(canManageRoles || canManageMembers || canCreateInvite) && (
                <>
                    <div className="sidebar-group-label">Люди</div>
                    {canManageRoles && renderSidebarItem('roles', 'Роли', <ShieldIcon />)}
                    {canManageMembers && renderSidebarItem('members', 'Участники', <UserIcon />)}
                    {canCreateInvite && renderSidebarItem('invites', 'Приглашения', <MailIcon />)}
                    
                    {canManageServer && (
                        <>
                            <div className="sidebar-group-label">Модерация</div>
                            {renderSidebarItem('safety', 'Безопасность', <LockIcon />)}
                        </>
                    )}
                </>
            )}
            
            <div style={{ flex: 1 }} />
            
            {isOwner && (
                 <div className="settings-tab-item danger" onClick={() => {
                     if (!isPublicDefaultServer && confirm(`Удалить сервер "{server.name}"?`)) {
                         webSocketService.sendMessage(C2S_MSG_TYPE.DELETE_SERVER, { serverId: server.id });
                         onClose();
                     }
                 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><TrashIcon /> Удалить сервер</span>
                </div>
            )}
        </div>

        <div className="server-settings-content">
            <div className="settings-scroll-container">
                {activeTab === 'overview' && (
                    <div className="settings-tab-content">
                        <div className="settings-section-title">Обзор сервера</div>
                        
                        <div className="server-banner-upload" 
                             style={{ backgroundImage: serverBanner ? `url(${serverBanner})` : 'none', cursor: canManageServer ? 'pointer' : 'default' }}
                             onClick={() => canManageServer && document.getElementById('banner-upload')?.click()}
                        >
                            {!serverBanner && <span>{canManageServer ? 'Нажмите, чтобы загрузить баннер сервера (16:9)' : 'Баннер не установлен'}</span>}
                            <input id="banner-upload" type="file" hidden accept="image/*" onChange={(e) => handleAvatarUpload(e, 'banner')} disabled={!canManageServer} />
                        </div>

                        <div className="avatar-upload-area" style={{ marginTop: '20px' }}>
                            <div className="avatar-section">
                                <label className="settings-label">Активная иконка</label>
                                <div className="avatar-preview" style={{ backgroundImage: activeAvatar ? `url(${activeAvatar})` : 'none' }}>
                                    {!activeAvatar && 'A'}
                                </div>
                                <div className="avatar-actions">
                                    <label className={`btn-upload small ${!canManageServer ? 'disabled' : ''}`}>
                                        Изменить
                                        <input type="file" hidden accept="image/*" onChange={(e) => handleAvatarUpload(e, 'active')} disabled={!canManageServer} />
                                    </label>
                                </div>
                            </div>
                            <div className="avatar-section">
                                <label className="settings-label">По умолчанию</label>
                                <div className="avatar-preview" style={{ backgroundImage: defaultAvatar ? `url(${defaultAvatar})` : 'none' }}>
                                    {!defaultAvatar && 'D'}
                                </div>
                                <div className="avatar-actions">
                                    <label className={`btn-upload small ${!canManageServer ? 'disabled' : ''}`}>
                                        Изменить
                                        <input type="file" hidden accept="image/*" onChange={(e) => handleAvatarUpload(e, 'default')} disabled={!canManageServer} />
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="settings-form-grid">
                            <div className="settings-form-group">
                                <label className="settings-label">Название сервера</label>
                                <input className="settings-input" value={serverName} onChange={(e) => setServerName(e.target.value)} disabled={!canManageServer} />
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">Канал приветствия</label>
                                <select className="settings-input" value={systemChannelId || ''} onChange={(e) => setSystemChannelId(e.target.value || null)} disabled={!canManageServer}>
                                    <option value="">Без канала приветствия</option>
                                    {serverChannels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="settings-form-group">
                            <label className="settings-label">Описание сервера</label>
                            <textarea className="settings-input settings-textarea" value={serverDescription} onChange={(e) => setServerDescription(e.target.value)} placeholder="О чем ваш сервер?" maxLength={200} disabled={!canManageServer} style={{ minHeight: '100px', resize: 'none' }} />
                        </div>

                        {canManageServer && (
                            <div className="settings-form-group">
                                <label className="checkbox-container">
                                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={isPublicDefaultServer} />
                                    Публичный сервер (виден всем)
                                    <span className="checkmark"></span>
                                </label>
                            </div>
                        )}
                        
                        {canManageServer && (
                            <div className="settings-actions">
                                <button className="btn-save" onClick={handleSaveOverview}><CheckIcon /> Сохранить изменения</button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'safety' && canManageServer && (
                    <div className="settings-tab-content">
                        <div className="settings-section-title">Безопасность</div>
                        <p className="settings-description">Настройте уровни проверки для новых участников сервера.</p>
                        
                        <div className="verification-levels">
                            {[ 
                                { level: 0, title: 'Нет', desc: 'Без ограничений. Свободное общение.' },
                                { level: 1, title: 'Низкий', desc: 'Участник должен иметь подтвержденный email в MurCHAT.' },
                                { level: 2, title: 'Высокий', desc: 'Участник должен находиться на сервере более 10 минут.' }
                            ].map(v => (
                                <div key={v.level} className={`verification-card ${verificationLevel === v.level ? 'active' : ''}`} onClick={() => canManageServer && setVerificationLevel(v.level)}>
                                    <div className="verif-check">{verificationLevel === v.level ? <CheckIcon /> : <div className="empty-circle" />}</div>
                                    <div className="verif-info">
                                        <h4>{v.title}</h4>
                                        <span>{v.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="settings-actions" style={{ marginTop: '40px' }}>
                            <button className="btn-save" onClick={handleSaveOverview}><CheckIcon /> Сохранить настройки безопасности</button>
                        </div>
                    </div>
                )}

                {activeTab === 'roles' && canManageRoles && <RoleSettings serverId={serverId} />}
                {activeTab === 'members' && canManageMembers && <MemberSettings serverId={serverId} />}
            </div>
        </div>

        <div className="btn-close-settings" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </div>
        <div className="esc-hint">ESC</div>
      </div>
    </div>
  );
};

export default ServerSettingsDialog;