import React, { useMemo } from 'react';
import './MembersSidebar.css';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import { setUserProfileForId } from '../../store/slices/authSlice';

interface MembersSidebarProps {
  className?: string;
}

const MembersSidebar: React.FC<MembersSidebarProps> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  const members = useSelector((state: RootState) => state.server.serverMembers || []);
  const roles = useSelector((state: RootState) => state.server.currentServerRoles || []);
  
  // Group members by their highest role or online/offline status
  const groupedMembers = useMemo(() => {
    const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
    const groups: Record<string, { name: string; color?: string; members: any[] }> = {};

    // Initialize groups for roles
    sortedRoles.forEach(role => {
      groups[role.id] = { name: role.name, color: role.color, members: [] };
    });

    // Add generic groups
    groups['online'] = { name: 'В сети', members: [] };
    groups['offline'] = { name: 'Не в сети', members: [] };

    members.forEach(member => {
      const isOnline = member.status && member.status !== 'offline';
      
      if (!isOnline) {
        groups['offline'].members.push(member);
      } else {
        const memberRoles = member.roles || [];
        const highestRole = sortedRoles.find(r => memberRoles.includes(r.id));
        
        if (highestRole) {
          groups[highestRole.id].members.push(member);
        } else {
          groups['online'].members.push(member);
        }
      }
    });

    return Object.values(groups).filter(g => g.members.length > 0);
  }, [members, roles]);

  return (
    <div className={`members-sidebar glass-panel ${className || ''}`}>
      <div className="members-header">Участники — {members.length}</div>
      <div className="members-scroll">
        {groupedMembers.map((group) => (
          <div key={group.name} className="member-group">
            <div className="member-group-title">
              {group.name} — {group.members.length}
            </div>
            {group.members.map((member) => {
              const avatarUrl = member.avatar;
              const hasAvatar = !!avatarUrl && avatarUrl !== 'null' && avatarUrl !== 'undefined';

              return (
                <div 
                  key={member.id} 
                  className="member-item" 
                  onClick={() => dispatch(setUserProfileForId(member.id))}
                >
                  <div className="member-avatar-wrapper">
                    <div 
                      className="member-avatar" 
                      style={{ 
                        backgroundColor: hasAvatar ? 'transparent' : generateAvatarColor(member.username),
                        backgroundImage: hasAvatar ? `url(${avatarUrl})` : 'none'
                      }}
                    >
                      {!hasAvatar && getInitials(member.username)}
                    </div>
                    <div className={`member-status-dot status-${member.status || 'offline'}`} />
                  </div>
                  <div className="member-info">
                    <span className="member-name" style={{ color: group.color || 'inherit' }}>
                      {member.username}
                    </span>
                    {member.statusText && <span className="member-status-text">{member.statusText}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MembersSidebar;
