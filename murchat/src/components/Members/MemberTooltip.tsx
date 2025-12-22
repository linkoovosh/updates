import React from 'react';
import { createPortal } from 'react-dom';
import type { ServerMember, Role } from '@common/types';
import './MemberTooltip.css';

interface MemberTooltipProps {
    member: ServerMember;
    roles: Role[]; // All server roles to look up details
    x: number;
    y: number;
}

const MemberTooltip: React.FC<MemberTooltipProps> = ({ member, roles, x, y }) => {
    // Filter and sort member's roles
    const memberRoles = roles
        .filter(r => member.roles && member.roles.includes(r.id))
        .sort((a, b) => b.position - a.position);

    // Calculate position to keep it on screen
    // Default: to the left of the cursor/element (since sidebar is on right)
    // Actually sidebar is usually on the right in Discord-likes.
    // Let's position it to the LEFT of the mouse X.
    const style: React.CSSProperties = {
        top: y,
        right: window.innerWidth - x + 10, // 10px offset from cursor/element
    };

    return createPortal(
        <div className="member-tooltip glass-panel" style={style}>
            <div className="tooltip-header">
                <span className="tooltip-username">{member.username}</span>
                <span className="tooltip-discriminator">#{member.discriminator}</span>
            </div>
            
            {memberRoles.length > 0 ? (
                <div className="tooltip-roles">
                    <div className="tooltip-section-title">РОЛИ</div>
                    {memberRoles.map(role => (
                        <div key={role.id} className="tooltip-role-item">
                            <div className="tooltip-role-dot" style={{ backgroundColor: role.color }} />
                            <span className="tooltip-role-name" style={{ color: role.color }}>{role.name}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="tooltip-no-roles">Нет ролей</div>
            )}
        </div>,
        document.body
    );
};

export default MemberTooltip;
