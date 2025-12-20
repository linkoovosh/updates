import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import UserContextMenu from './UserContextMenu';
import MemberTooltip from './MemberTooltip';
import type { ServerMember } from '@common/types';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types';
import './MembersSidebar.css';

interface MembersSidebarProps {
    className?: string;
}

const MembersSidebar: React.FC<MembersSidebarProps> = ({ className }) => {
    const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
    const members = useSelector((state: RootState) => state.server.serverMembers);
    const roles = useSelector((state: RootState) => state.server.currentServerRoles);
    const auth = useSelector((state: RootState) => state.auth); // UPDATED
    const currentUserId = auth.userId;
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: ServerMember } | null>(null);
    const [hoveredMember, setHoveredMember] = useState<{ member: ServerMember; x: number; y: number } | null>(null);

    // --- EFFECTIVE MEMBERS LIST ---
    // Ensure I am ALWAYS in the list if I'm looking at a server
    const effectiveMembers = React.useMemo(() => {
        const list = [...members];
        if (currentUserId && !list.find(m => m.id === currentUserId)) {
            // Self-injection for reliability
            list.push({
                id: auth.userId!,
                username: auth.username || 'Unknown',
                discriminator: auth.discriminator || '0000',
                email: auth.email || '',
                avatar: auth.avatar,
                status: 'online',
                bio: auth.bio || '',
                profile_banner: auth.profile_banner,
                profile_theme: auth.profile_theme,
                roles: [],
                joinedAt: null
            });
        }
        return list;
    }, [members, auth, currentUserId]);

    useEffect(() => {
        if (selectedServerId) {
            console.log(`[MembersSidebar] Fetching members for server: ${selectedServerId}`);
            webSocketService.sendMessage(C2S_MSG_TYPE.GET_SERVER_MEMBERS, { serverId: selectedServerId });
        }
    }, [selectedServerId]);

    const handleContextMenu = (e: React.MouseEvent, user: ServerMember) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, user });
    };

    const handleMouseEnter = (e: React.MouseEvent, member: ServerMember) => {
        const rect = e.currentTarget.getBoundingClientRect();
        // Position tooltip to the left of the item
        setHoveredMember({ member, x: rect.left, y: rect.top });
    };

    const handleMouseLeave = () => {
        setHoveredMember(null);
    };

    const getMemberRoleData = (member: ServerMember) => {
        if (!member.roles || member.roles.length === 0) return { color: undefined, roleDots: [] };

        const memberRoles = roles
            .filter(r => member.roles.includes(r.id))
            .sort((a, b) => b.position - a.position);

        if (memberRoles.length === 0) return { color: undefined, roleDots: [] };

        const color = memberRoles[0].color;
        const roleDots = memberRoles.map(r => ({ id: r.id, color: r.color, name: r.name }));

        return { color, roleDots };
    };

    console.log('[MembersSidebar] Render. Members:', effectiveMembers.length, 'Roles:', roles.length);

    // --- Grouping Logic ---
    const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
    const groups: { name: string; color?: string; members: ServerMember[] }[] = [];
    
    const isOnline = (m: ServerMember) => m.id === currentUserId || m.status === 'online' || m.status === 'dnd' || m.status === 'idle';

    // 1. Role Groups
    sortedRoles.forEach(role => {
        const roleMembers = effectiveMembers.filter(m => {
            if (!isOnline(m)) return false;
            if (!m.roles || !Array.isArray(m.roles) || m.roles.length === 0) return false;
            
            // Get all valid roles for this member that actually exist in the server roles list
            const validMemberRoles = roles
                .filter(r => m.roles.includes(r.id))
                .sort((a, b) => b.position - a.position);
            
            return validMemberRoles.length > 0 && validMemberRoles[0].id === role.id;
        });
        
        if (roleMembers.length > 0) {
            groups.push({ name: role.name.toUpperCase(), color: role.color, members: roleMembers });
        }
    });

    // 2. Online (No roles or roles hidden)
    const onlineMembers = effectiveMembers.filter(m => 
        isOnline(m) && 
        (!m.roles || !Array.isArray(m.roles) || m.roles.length === 0 || !m.roles.some(rId => roles.find(r => r.id === rId)))
    );
    if (onlineMembers.length > 0) {
        groups.push({ name: 'В СЕТИ', members: onlineMembers });
    }

    // 3. Offline
    const offlineMembers = effectiveMembers.filter(m => !isOnline(m));
    if (offlineMembers.length > 0) {
        groups.push({ name: 'ОФФЛАЙН', members: offlineMembers });
    }

    return (
        <div className={`members-sidebar glass-panel ${className || ''}`}>
            {groups.map(group => (
                <div key={group.name} className="member-group">
                    <div className="group-header" style={{ color: group.color ? group.color : 'var(--text-tertiary)' }}>
                        {group.name} — {group.members.length}
                    </div>
                    {group.members.map(member => {
                        const { color, roleDots } = getMemberRoleData(member);
                        return (
                            <div 
                                key={member.id} 
                                className="member-item"
                                onContextMenu={(e) => handleContextMenu(e, member)}
                                onMouseEnter={(e) => handleMouseEnter(e, member)}
                                onMouseLeave={handleMouseLeave}
                            >
                                <div className="member-avatar-wrapper">
                                    <div 
                                        className="member-avatar"
                                        style={{
                                            backgroundImage: member.avatar ? `url(${member.avatar})` : 'none',
                                            backgroundColor: member.avatar ? 'transparent' : generateAvatarColor(member.username)
                                        }}
                                    >
                                        {!member.avatar && getInitials(member.username)}
                                    </div>
                                    <div className={`status-indicator ${member.status || 'offline'}`} />
                                </div>
                                <div className="member-content">
                                    <div 
                                        className="member-name" 
                                        style={{ 
                                            opacity: member.status === 'offline' ? 0.5 : 1,
                                            color: color || 'var(--text-primary)'
                                        }}
                                    >
                                        {member.username}
                                    </div>
                                    
                                    {member.activity && (
                                        <div className="member-activity" style={{ fontSize: '11px', color: '#b9bbbe', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            {member.activity.icon && (
                                                <img src={member.activity.icon} alt="" style={{ width: 14, height: 14 }} />
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {member.activity.name}
                                            </span>
                                        </div>
                                    )}

                                    {roleDots.length > 0 && !member.activity && (
                                        <div className="member-roles-mini">
                                            {roleDots.map(dot => (
                                                <div 
                                                    key={dot.id} 
                                                    className="member-role-dot" 
                                                    style={{ backgroundColor: dot.color }}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
            
            {contextMenu && (
                <UserContextMenu 
                    position={contextMenu} 
                    user={contextMenu.user} 
                    onClose={() => setContextMenu(null)} 
                />
            )}
            {hoveredMember && (
                <MemberTooltip 
                    member={hoveredMember.member} 
                    roles={roles} 
                    x={hoveredMember.x} 
                    y={hoveredMember.y} 
                />
            )}
        </div>
    );
};

export default MembersSidebar;
