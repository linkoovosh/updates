import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { ALL_PERMISSIONS } from '../../common/permissions';

export const usePermissions = (serverId: string | null) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const servers = useSelector((state: RootState) => state.ui.servers);
    const selectedServerId = useSelector((state: RootState) => state.ui.selectedServerId);
    const serverMembers = useSelector((state: RootState) => state.server.serverMembers);
    const serverRoles = useSelector((state: RootState) => state.server.currentServerRoles);
    
    if (!serverId || !userId) return 0n;

    // We can only calculate permissions correctly if we have data for this server
    // Assuming state.server stores data for the ACTIVE (selected) server
    if (serverId !== selectedServerId) return 0n;

    const server = servers.find(s => s.id === serverId);
    // Owner override
    if (server && server.ownerId === userId) return ALL_PERMISSIONS;

    const me = serverMembers.find(m => m.id === userId);
    if (!me || !me.roles) return 0n;

    let totalPerms = 0n;
    me.roles.forEach(roleId => {
        const role = serverRoles.find(r => r.id === roleId);
        if (role && role.permissions) {
            totalPerms |= BigInt(role.permissions);
        }
    });

    return totalPerms;
};
