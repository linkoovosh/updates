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
  
  // Group members by status
  const groupedMembers = useMemo(() => {
    const groups = {
      online: [] as any[],
      offline: [] as any[]
    };

    members.forEach(member => {
      if (member.status && member.status !== 'offline') {
        groups.online.push(member);
      } else {
        groups.offline.push(member);
      }
    });

    return groups;
  }, [members]);

  const renderMember = (member: any, index: number, totalPrev: number) => {
    const avatarUrl = member.avatar;
    const hasAvatar = !!avatarUrl && avatarUrl !== 'null' && avatarUrl !== 'undefined';
    
    // Calculate staggered delay (max 2 seconds total spread)
    const delay = Math.min((totalPrev + index) * 0.05, 2);

    return (
      <div 
        key={member.id} 
        className="member-item" 
        style={{ animationDelay: `${delay}s` }}
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
          <span className="member-name" style={{ color: member.highestRoleColor || 'inherit' }}>
            {member.username}
          </span>
          {member.statusText && <span className="member-status-text">{member.statusText}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className={`members-sidebar glass-panel ${className || ''}`}>
      <div className="members-header">Участники — {members.length}</div>
      <div className="members-scroll">
        {groupedMembers.online.length > 0 && (
          <div className="member-group">
            <div className="member-group-title">В сети — {groupedMembers.online.length}</div>
            {groupedMembers.online.map((m, i) => renderMember(m, i, 0))}
          </div>
        )}
        
        {groupedMembers.offline.length > 0 && (
          <div className="member-group">
            <div className="member-group-title">Не в сети — {groupedMembers.offline.length}</div>
            {groupedMembers.offline.map((m, i) => renderMember(m, i, groupedMembers.online.length))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MembersSidebar;
