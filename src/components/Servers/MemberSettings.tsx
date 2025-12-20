import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { C2S_MSG_TYPE } from '../../../common/types';
import type { Role } from '../../../common/types';
import webSocketService from '../../services/websocket';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';

interface MemberSettingsProps {
    serverId: string;
}

const MemberSettings: React.FC<MemberSettingsProps> = ({ serverId }) => {
    const members = useSelector((state: RootState) => state.server.serverMembers);
    const roles = useSelector((state: RootState) => state.server.currentServerRoles);
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
        // We don't close dropdown here to allow multiple toggles
    };

    return (
        <div>
            <div className="settings-section-title">Участники</div>
            
            <div className="settings-form-group">
                <input 
                    className="settings-input" 
                    placeholder="Поиск участников" 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                />
            </div>

            <div className="member-list">
                {filteredMembers.map(member => (
                    <div key={member.id} className="member-item">
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
                            <span className="member-name">{member.username}</span>
                            <span className="member-discriminator">#{member.discriminator}</span>
                        </div>
                        
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
                            <div 
                                className="add-role-btn" 
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setRoleDropdown({ userId: member.id, x: rect.left, y: rect.bottom + 5 });
                                }}
                            >
                                +
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {roleDropdown && (
                <div 
                    className="role-dropdown-popup" 
                    ref={dropdownRef}
                    style={{ top: roleDropdown.y, left: roleDropdown.x - 150 }}
                >
                    {roles.length === 0 && <div style={{ padding: 8, color: 'var(--text-muted)' }}>Нет ролей</div>}
                    {roles.map(role => {
                        const member = members.find(m => m.id === roleDropdown.userId);
                        const hasRole = member?.roles?.includes(role.id);
                        return (
                            <div key={role.id} className="role-dropdown-item" onClick={() => toggleRole(roleDropdown.userId, role.id)}>
                                <div style={{ 
                                    width: 16, height: 16, borderRadius: 4, 
                                    border: `1px solid ${role.color}`,
                                    backgroundColor: hasRole ? role.color : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {hasRole && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                                <span style={{ color: role.color }}>{role.name}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MemberSettings;
