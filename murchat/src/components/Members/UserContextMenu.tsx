import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { setUserProfileForId } from '../../store/slices/authSlice';
import { setActiveDmConversationId, setDmView } from '../../store/slices/chatSlice'; 
import { setSelectedServerId } from '../../store/slices/serverSlice'; 
import { updateVoiceState } from '../../store/slices/voiceSlice'; // NEW
import type { RootState } from '../../store'; // NEW
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types';
import type { User } from '@common/types';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS, hasPermission } from '../../../common/permissions';
import { 
    UserIcon, MailIcon, MicIcon, CheckIcon, ExitIcon, TrashIcon 
} from '../UI/Icons'; // IMPORT ICONS

interface UserContextMenuProps {
    position: { x: number; y: number };
    user: User;
    onClose: () => void;
}

const UserContextMenu: React.FC<UserContextMenuProps> = ({ position, user, onClose }) => {
    const dispatch = useDispatch();
    const menuRef = useRef<HTMLDivElement>(null);
    
    const voiceStates = useSelector((state: RootState) => state.voice?.voiceStates);
    const selectedServerId = useSelector((state: RootState) => state.ui.selectedServerId);
    const serverMembers = useSelector((state: RootState) => state.server.serverMembers);
    const currentServerRoles = useSelector((state: RootState) => state.server.currentServerRoles);
    
    const perms = usePermissions(selectedServerId);
    const canManageRoles = hasPermission(perms, PERMISSIONS.MANAGE_ROLES);
    const canKick = hasPermission(perms, PERMISSIONS.KICK_MEMBERS);
    const canBan = hasPermission(perms, PERMISSIONS.BAN_MEMBERS);

    const userVoiceState = voiceStates ? voiceStates[user.id] : undefined;
    const targetMember = selectedServerId ? serverMembers.find(m => m.id === user.id) : null;

    console.log("UserContextMenu render for:", user.username, "VoiceState:", userVoiceState);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleViewProfile = () => {
        dispatch(setUserProfileForId(user.id));
        onClose();
    };

    const handleSendMessage = () => {
        dispatch(setSelectedServerId(null)); 
        dispatch(setDmView('dms'));
        dispatch(setActiveDmConversationId(user.id));
        onClose();
    };

    const handleCall = () => {
        webSocketService.startCall(user.id, { username: user.username, avatar: user.avatar });
        onClose();
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseInt(e.target.value, 10);
        dispatch(updateVoiceState({ userId: user.id, partialState: { localVolume: newVolume } }));
    };

    const toggleRole = (roleId: string) => {
        if (!targetMember || !selectedServerId) return;
        const currentRoles = targetMember.roles || [];
        let newRoles;
        if (currentRoles.includes(roleId)) {
            newRoles = currentRoles.filter(r => r !== roleId);
        } else {
            newRoles = [...currentRoles, roleId];
        }
        webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_MEMBER_ROLES, {
            serverId: selectedServerId,
            userId: user.id,
            roleIds: newRoles
        });
    };

    const handleKick = () => {
        if (!selectedServerId) return;
        if (confirm(`Вы уверены, что хотите выгнать ${user.username}?`)) {
            webSocketService.sendMessage(C2S_MSG_TYPE.KICK_MEMBER, {
                serverId: selectedServerId,
                userId: user.id
            });
            onClose();
        }
    };

    const handleBan = () => {
        if (!selectedServerId) return;
        const reason = prompt('Причина бана (необязательно):');
        if (reason !== null) {
            webSocketService.sendMessage(C2S_MSG_TYPE.BAN_MEMBER, {
                serverId: selectedServerId,
                userId: user.id,
                reason
            });
            onClose();
        }
    };

    // Calculate position to prevent overflow
    let top = position.y;
    let left = position.x;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    const estimatedHeight = 300 + (canManageRoles ? (currentServerRoles.length * 30) : 0);
    if (top + estimatedHeight > window.innerHeight) top = window.innerHeight - estimatedHeight;

    const style = { top, left };

    return createPortal(
        <div className="glass-menu" style={style} ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <div className="glass-menu-item" onClick={handleViewProfile}>
                <span className="icon"><UserIcon /></span> Посмотреть профиль
            </div>
            <div className="glass-menu-item" onClick={handleSendMessage}>
                <span className="icon"><MailIcon /></span> Написать сообщение
            </div>
            <div className="glass-menu-item" onClick={handleCall}>
                <span className="icon"><MicIcon /></span> Позвонить
            </div>
            
            <div className="glass-menu-separator" />

            {/* Voice Settings Section */}
            {userVoiceState && (
                <>
                    <div className="glass-menu-item" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span>Громкость</span>
                            <span>{userVoiceState?.localVolume ?? 100}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="200" 
                            value={userVoiceState?.localVolume ?? 100} 
                            onChange={handleVolumeChange}
                            style={{ width: '100%', accentColor: 'var(--accent-primary)', height: '4px' }}
                        />
                    </div>
                    <div className="glass-menu-item" onClick={() => dispatch(updateVoiceState({ userId: user.id, partialState: { isMuted: !userVoiceState.isMuted } }))}>
                        <span className="icon">{userVoiceState?.isMuted ? <CheckIcon /> : <div className="empty-square" />}</span> 
                        <span style={{ flex: 1 }}>Заглушить локально</span>
                        {userVoiceState?.isMuted && <span style={{ color: 'var(--status-negative)' }}><CheckIcon /></span>}
                    </div>
                    <div className="glass-menu-separator" />
                </>
            )}

            {/* Roles Section */}
            {selectedServerId && canManageRoles && targetMember && currentServerRoles.length > 0 && (
                <>
                    <div className="glass-menu-label" style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Роли</div>
                    {currentServerRoles.map(role => (
                        <div key={role.id} className="glass-menu-item" onClick={(e) => { e.stopPropagation(); toggleRole(role.id); }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: role.color, marginRight: 8, border: '1px solid rgba(255,255,255,0.2)' }}></div>
                            <span style={{ flex: 1, color: role.color }}>{role.name}</span>
                            {targetMember.roles?.includes(role.id) && <span style={{ color: 'var(--status-positive)' }}><CheckIcon /></span>}
                        </div>
                    ))}
                    <div className="glass-menu-separator" />
                </>
            )}

            {(canKick || canBan) && (
                <>
                    {canKick && <div className="glass-menu-item danger" onClick={handleKick}>
                        <span className="icon"><ExitIcon /></span> Выгнать
                    </div>}
                    {canBan && <div className="glass-menu-item danger" onClick={handleBan}>
                        <span className="icon"><TrashIcon /></span> Забанить
                    </div>}
                </>
            )}
        </div>,
        document.body
    );
};

export default UserContextMenu;
