import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import UserContextMenu from './UserContextMenu';
import MemberTooltip from './MemberTooltip';
import type { ServerMember } from '@common/types';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types';
import { CrownIcon } from '../UI/Icons';
import { setUserProfileForId } from '../../store/slices/authSlice';
import './MembersSidebar.css';

interface MembersSidebarProps {
    className?: string;
}

const MembersSidebar: React.FC<MembersSidebarProps> = ({ className }) => {
    const dispatch = useDispatch();
    const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
    const servers = useSelector((state: RootState) => state.server.servers) || [];
    const server = servers.find(s => s.id === selectedServerId);
    const members = useSelector((state: RootState) => state.server.serverMembers) || [];
    const roles = useSelector((state: RootState) => state.server.currentServerRoles) || [];
    const auth = useSelector((state: RootState) => state.auth) || {}; 
    const currentUserId = auth.userId;
    
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: ServerMember } | null>(null);
    const [hoveredMember, setHoveredMember] = useState<{ member: ServerMember; x: number; y: number } | null>(null);

    // --- SHARED HELPERS ---
    const isOnline = (m: ServerMember) => m && (m.id === currentUserId || m.status === 'online' || m.status === 'dnd' || m.status === 'idle');

    const getMemberRoleColor = (member: ServerMember) => {
        if (!member || !member.roles || member.roles.length === 0) return undefined;
        const currentRoles = roles || [];
        const memberRoles = currentRoles
            .filter(r => member.roles.includes(r.id))
            .sort((a, b) => b.position - a.position);
        return memberRoles.length > 0 ? memberRoles[0].color : undefined;
    };

    // --- EFFECTIVE MEMBERS LIST ---
    const effectiveMembers = React.useMemo(() => {
        const list = Array.isArray(members) ? [...members] : [];
        if (currentUserId && !list.find(m => m && m.id === currentUserId)) {
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
            webSocketService.sendMessage(C2S_MSG_TYPE.GET_SERVER_MEMBERS, { serverId: selectedServerId });
        }
    }, [selectedServerId]);

    const handleContextMenu = (e: React.MouseEvent, user: ServerMember) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, user });
    };

    // --- Grouping Logic ---
    const groupedMembers = React.useMemo(() => {
        if (!server || !effectiveMembers) return [];

        const ownerId = server.ownerId;
        const groups: { name: string; color?: string; members: ServerMember[] }[] = [];
        const currentRoles = roles || [];
        
        const getHighestRole = (memberRoles: string[]) => {
            if (!memberRoles || memberRoles.length === 0) return null;
            const validRoles = currentRoles.filter(r => memberRoles.includes(r.id));
            if (validRoles.length === 0) return null;
            return validRoles.sort((a, b) => b.position - a.position)[0];
        };

        const processedIds = new Set<string>();
        const sortedRoles = [...currentRoles].sort((a, b) => b.position - a.position);

        // 1. Roles (Online Only + Owner)
        sortedRoles.forEach(role => {
            const roleMembers = effectiveMembers.filter(m => {
                if (!m || processedIds.has(m.id)) return false;
                const isMemberOnline = isOnline(m);
                const isOwner = m.id === ownerId;
                if (!isMemberOnline && !isOwner) return false;

                const highest = getHighestRole(m.roles);
                return highest && highest.id === role.id;
            });

            if (roleMembers.length > 0) {
                roleMembers.sort((a, b) => {
                    if (a.id === ownerId) return -1;
                    if (b.id === ownerId) return 1;
                    return (a.username || "").localeCompare(b.username || "");
                });
                groups.push({ name: (role.name || "ROLE").toUpperCase(), color: role.color, members: roleMembers });
                roleMembers.forEach(m => processedIds.add(m.id));
            }
        });

        // 2. Online (No Role)
        const onlineNoRole = effectiveMembers.filter(m => {
            if (!m || processedIds.has(m.id)) return false;
            const isMemberOnline = isOnline(m);
            const isOwner = m.id === ownerId;
            return (isMemberOnline || isOwner);
        });

        if (onlineNoRole.length > 0) {
            onlineNoRole.sort((a, b) => {
                if (a.id === ownerId) return -1;
                if (b.id === ownerId) return 1;
                return (a.username || "").localeCompare(b.username || "");
            });
            groups.push({ name: 'В СЕТИ', members: onlineNoRole });
            onlineNoRole.forEach(m => processedIds.add(m.id));
        }

        // 3. Offline
        const offlineMembers = effectiveMembers.filter(m => m && !processedIds.has(m.id));
        if (offlineMembers.length > 0) {
            offlineMembers.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
            groups.push({ name: 'НЕ В СЕТИ', members: offlineMembers });
        }

        return groups;
    }, [effectiveMembers, roles, server, currentUserId]);

    return (
        <div className={`members-sidebar glass-panel ${className || ''}`}>
            {groupedMembers.map(group => (
                <div key={group.name} className="member-group">
                    <div className="group-header" style={{ color: group.color ? group.color : 'var(--text-tertiary)' }}>
                        {group.name} — {group.members.length}
                    </div>
                    {group.members.map(member => {
                        if (!member) return null; 
                        const roleColor = getMemberRoleColor(member);
                        const isOwner = server?.ownerId === member.id;
                        const isMemberOnline = isOnline(member);
                        const hasActivity = member.activity && isMemberOnline;

                        if (hasActivity) {
                            return (
                                <div key={member.id} className="activity-card"
                                    onClick={() => dispatch(setUserProfileForId(member.id))}
                                    onContextMenu={(e) => handleContextMenu(e, member)}>
                                    <div className="activity-avatar-wrapper">
                                        <div className="activity-avatar"
                                            style={{
                                                backgroundImage: member.avatar ? `url(${member.avatar})` : 'none',
                                                backgroundColor: member.avatar ? 'transparent' : generateAvatarColor(member.username)
                                            }}
                                        >
                                            {!member.avatar && getInitials(member.username)}
                                        </div>
                                        <div className={`activity-status-dot ${member.status || 'online'}`} />
                                    </div>
                                    <div className="activity-content">
                                        <div className="member-name-row">
                                            <span className="activity-game-name" style={{ color: roleColor || '#fff' }}>{member.username}</span>
                                            {isOwner && (
                                                <div className="member-badges">
                                                    <span className="owner-crown" title="Владелец">
                                                        <CrownIcon />
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="activity-details">Играет в <strong>{member.activity!.name}</strong></div>
                                    </div>
                                    {member.activity!.icon && (
                                        <div className="activity-icon-right">
                                            <img src={member.activity!.icon} alt="" />
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <div key={member.id} 
                                className={`member-item ${!isMemberOnline ? 'offline' : ''}`}
                                onClick={() => dispatch(setUserProfileForId(member.id))}
                                onContextMenu={(e) => handleContextMenu(e, member)}>
                                <div className="member-avatar-wrapper">
                                    <div className="member-avatar"
                                        style={{
                                            backgroundImage: member.avatar ? `url(${member.avatar})` : 'none',
                                            backgroundColor: member.avatar ? 'transparent' : generateAvatarColor(member.username)
                                        }}
                                    >
                                        {!member.avatar && getInitials(member.username)}
                                    </div>
                                    {isMemberOnline && <div className={`status-indicator ${member.status || 'online'}`} />}
                                </div>
                                <div className="member-content">
                                    <div className="member-name-row">
                                        <span className="member-name" style={{ color: roleColor || 'var(--text-primary)' }}>{member.username}</span>
                                        {isOwner && (
                                            <div className="member-badges">
                                                <span className="owner-crown" title="Владелец">
                                                    <CrownIcon />
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {isMemberOnline && member.bio && (
                                        <div className="member-activity" title={member.bio}>
                                            {member.bio.length > 7 ? member.bio.substring(0, 7) + "..." : member.bio}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
            
            {contextMenu && <UserContextMenu position={contextMenu} user={contextMenu.user} onClose={() => setContextMenu(null)} />}
            {hoveredMember && <MemberTooltip member={hoveredMember.member} roles={roles} x={hoveredMember.x} y={hoveredMember.y} />}
        </div>
    );
};

export default MembersSidebar;
