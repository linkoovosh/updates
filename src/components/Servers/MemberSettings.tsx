import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { C2S_MSG_TYPE } from '../../../common/types';
import webSocketService from '../../services/websocket';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import { CrownIcon, PlusIcon, TrashIcon, ShieldIcon } from '../UI/Icons';

interface MemberSettingsProps {
    serverId: string;
}

const MemberSettings: React.FC<MemberSettingsProps> = ({ serverId }) => {
    const members = useSelector((state: RootState) => state.server.serverMembers);
    const roles = useSelector((state: RootState) => state.server.currentServerRoles);
    const server = useSelector((state: RootState) => state.server.servers.find(s => s.id === serverId));
    const currentUserId = useSelector((state: RootState) => state.auth.userId);
    
    const [search, setSearch] = useState('');
    const [roleDropdown, setRoleDropdown] = useState<{ userId: string; x: number; y: number } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Filter members
    const filteredMembers = members.filter(m => 
        m.username.toLowerCase().includes(search.toLowerCase()) || 
        m.discriminator.includes(search)
    );

    // Handle outside click for dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setRoleDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleRole = (userId: string, roleId: string) => {
        const member = members.find(m => m.id === userId);
        if (!member) return;

        const currentRoles = member.roles || [];
        let newRoles;
        if (currentRoles.includes(roleId)) {
            newRoles = currentRoles.filter(r => r !== roleId);
        } else {
            newRoles = [...currentRoles, roleId];
        }

        webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_MEMBER_ROLES, {
            serverId,
            userId,
            roleIds: newRoles
        });
    };

    const handleKick = (memberId: string, username: string) => {
        if (confirm(`Вы уверены, что хотите выгнать ${username}?`)) {
            webSocketService.sendMessage(C2S_MSG_TYPE.KICK_MEMBER, { serverId, userId: memberId });
        }
    };

    const handleBan = (memberId: string, username: string) => {
        const reason = prompt(`Причина бана для ${username}:`);
        if (reason !== null) {
            webSocketService.sendMessage(C2S_MSG_TYPE.BAN_MEMBER, { serverId, userId: memberId, reason });
        }
    };

    const getRolePosition = (roleIds: string[]) => {
        if (!roleIds || roleIds.length === 0) return 0;
        const memberRoles = roles.filter(r => roleIds.includes(r.id));
        return Math.max(...memberRoles.map(r => r.position), 0);
    };

    const myMember = members.find(m => m.id === currentUserId);
    const myHighestRolePos = server?.ownerId === currentUserId ? 999999 : getRolePosition(myMember?.roles || []);

    return (
        <div className="member-settings-container">
            <div className="settings-section-title">Участники — {members.length}</div>
            
            <div className="settings-form-group">
                <input 
                    className="settings-input" 
                    placeholder="Поиск по имени или тегу" 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                />
            </div>

            <div className="member-list-virtual">
                {filteredMembers.map(member => {
                    const isOwner = server?.ownerId === member.id;
                    const targetHighestRolePos = isOwner ? 999999 : getRolePosition(member.roles);
                    const canManage = myHighestRolePos > targetHighestRolePos;
                    const isMe = member.id === currentUserId;

                    return (
                        <div key={member.id} className="member-row">
                            <div className="member-row-left">
                                <div 
                                    className="member-avatar"
                                    style={{ 
                                        backgroundColor: member.avatar ? 'transparent' : generateAvatarColor(member.username),
                                        backgroundImage: member.avatar ? `url(${member.avatar})` : 'none'
                                    }}
                                >
                                    {!member.avatar && getInitials(member.username)}
                                </div>
                                <div className="member-info">
                                    <div className="member-name-row">
                                        <span className="member-name">{member.username}</span>
                                        {isOwner && <span className="owner-crown" title="Владелец сервера"><CrownIcon /></span>}
                                    </div>
                                    <span className="member-discriminator">#{member.discriminator}</span>
                                </div>
                            </div>
                            
                            <div className="member-row-right">
                                <div className="role-pills">
                                    {member.roles && member.roles.map(roleId => {
                                        const role = roles.find(r => r.id === roleId);
                                        if (!role) return null;
                                        return (
                                            <div key={roleId} className="role-pill" style={{ border: `1px solid ${role.color}` }}>
                                                <div className="role-pill-dot" style={{ backgroundColor: role.color }}></div>
                                                {role.name}
                                            </div>
                                        );
                                    })}
                                    {canManage && (
                                        <div 
                                            className="add-role-btn" 
                                            onClick={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setRoleDropdown({ userId: member.id, x: rect.left, y: rect.bottom + 5 });
                                            }}
                                            title="Управление ролями"
                                        >
                                            <PlusIcon />
                                        </div>
                                    )}
                                </div>

                                {canManage && !isMe && (
                                    <div className="member-actions">
                                        <button className="icon-btn-danger" title="Выгнать" onClick={() => handleKick(member.id, member.username)}>
                                            <div style={{ transform: 'rotate(180deg)' }}>↪️</div>
                                        </button>
                                        <button className="icon-btn-danger" title="Забанить" onClick={() => handleBan(member.id, member.username)}>
                                            <ShieldIcon />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {roleDropdown && (
                <div 
                    className="role-dropdown-popup" 
                    ref={dropdownRef}
                    style={{ top: roleDropdown.y, left: roleDropdown.x - 200, position: 'fixed', zIndex: 9999 }}
                >
                    <div className="role-dropdown-header">Роли</div>
                    {roles.length === 0 && <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: '13px' }}>Нет ролей</div>}
                    <div className="role-dropdown-list">
                        {roles.map(role => {
                            const member = members.find(m => m.id === roleDropdown.userId);
                            const hasRole = member?.roles?.includes(role.id);
                            // Cannot assign roles higher than my own (unless owner)
                            const isTooHigh = server?.ownerId !== currentUserId && role.position >= myHighestRolePos;

                            return (
                                <div 
                                    key={role.id} 
                                    className={`role-dropdown-item ${isTooHigh ? 'disabled' : ''}`} 
                                    onClick={() => !isTooHigh && toggleRole(roleDropdown.userId, role.id)}
                                >
                                    <div className={`role-checkbox ${hasRole ? 'checked' : ''}`} style={{ borderColor: role.color }}>
                                        {hasRole && <div className="role-checkbox-inner" style={{ backgroundColor: role.color }} />}
                                    </div>
                                    <span style={{ color: role.color }}>{role.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MemberSettings;