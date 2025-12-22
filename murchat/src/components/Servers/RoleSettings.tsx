import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '../../../common/types';
import type { RootState } from '../../store';
import type { Role } from '../../../common/types';
import { 
    PERMISSIONS, 
    PERMISSION_DETAILS, 
    hasPermission, 
    addPermission, 
    removePermission
} from '../../../common/permissions';
import './RoleSettings.css';

interface RoleSettingsProps {
    serverId: string;
}

const RoleSettings: React.FC<RoleSettingsProps> = ({ serverId }) => {
    const roles = useSelector((state: RootState) => state.server.currentServerRoles);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [name, setName] = useState('');
    const [color, setColor] = useState('#99AAB5');
    const [permissions, setPermissions] = useState<string>('0');

    // Reset editing state when server changes or roles are reloaded
    useEffect(() => {
        if (editingRole) {
            const updatedRole = roles.find(r => r.id === editingRole.id);
            if (updatedRole) {
                // Optionally update state if role changed externally, 
                // but usually we want to keep local edits until save.
                // For now, do nothing to avoid overwriting user input while typing.
            } else {
                // Role deleted
                setEditingRole(null);
            }
        }
    }, [roles, editingRole]);

    const handleCreateRole = () => {
        webSocketService.sendMessage(C2S_MSG_TYPE.CREATE_ROLE, {
            serverId,
            name: 'New Role',
            color: '#99AAB5'
        });
    };

    const handleEditRole = (role: Role) => {
        setEditingRole(role);
        setName(role.name);
        setColor(role.color);
        setPermissions(role.permissions || '0');
    };

    const handleSaveRole = () => {
        if (editingRole) {
            webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_ROLE, {
                serverId,
                roleId: editingRole.id,
                name,
                color,
                permissions: permissions // Sending as string
            });
            // We don't clear editingRole here to allow further edits, 
            // or we can clear it if we want to go back to list.
            // Let's keep it open to show "Saved" state ideally, but for now just stay open.
            alert('Роль сохранена!');
        }
    };

    const togglePermission = (permValue: bigint) => {
        const has = hasPermission(permissions, permValue);
        let newPerms;
        if (has) {
            newPerms = removePermission(permissions, permValue);
        } else {
            newPerms = addPermission(permissions, permValue);
        }
        setPermissions(newPerms);
    };

    const handleDeleteRole = (roleId: string) => {
        if (confirm('Are you sure you want to delete this role?')) {
            webSocketService.sendMessage(C2S_MSG_TYPE.DELETE_ROLE, {
                serverId,
                roleId
            });
            if (editingRole?.id === roleId) setEditingRole(null);
        }
    };

    return (
        <div className="role-settings-container">
            <div className="role-sidebar">
                <div className="role-list-header">
                    <h3>РОЛИ</h3>
                    <button className="btn-add-role" onClick={handleCreateRole} title="Создать роль">+</button>
                </div>
                <div className="role-list">
                    {roles.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Нет ролей.</div>}
                    {roles.map(role => (
                        <div key={role.id} className={`role-item ${editingRole?.id === role.id ? 'active' : ''}`} onClick={() => handleEditRole(role)}>
                            <div className="role-color-dot" style={{ backgroundColor: role.color }} />
                            <span className="role-name" style={{ color: role.color }}>{role.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="role-content">
                {editingRole ? (
                    <div className="role-editor">
                        <h2 style={{ marginBottom: 0 }}>Редактирование: {editingRole.name}</h2>
                        
                        <div className="settings-form-group">
                            <label className="settings-label">Название роли</label>
                            <input 
                                className="settings-input"
                                type="text" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                placeholder="Название роли"
                            />
                        </div>

                        <div className="settings-form-group">
                            <label className="settings-label">Цвет роли</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input 
                                    type="color" 
                                    value={color} 
                                    onChange={e => setColor(e.target.value)}
                                    style={{ border: 'none', width: '40px', height: '40px', cursor: 'pointer', backgroundColor: 'transparent' }} 
                                />
                                <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{color}</span>
                            </div>
                        </div>

                        <div className="permissions-section">
                            <h3 className="settings-section-title">Права доступа</h3>
                            <div className="permissions-list">
                                {Object.entries(PERMISSION_DETAILS).map(([permValStr, details]) => {
                                    const permVal = BigInt(permValStr);
                                    const isEnabled = hasPermission(permissions, permVal);
                                    
                                    return (
                                        <div key={permValStr} className="permission-item">
                                            <div className="permission-info">
                                                <div className="permission-name">{details.name}</div>
                                                <div className="permission-desc">{details.description}</div>
                                            </div>
                                            <label className="switch">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isEnabled} 
                                                    onChange={() => togglePermission(permVal)}
                                                />
                                                <span className="slider round"></span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="role-actions-footer">
                            <button className="btn-remove" onClick={() => handleDeleteRole(editingRole.id)} style={{ color: 'var(--status-negative)' }}>Удалить роль</button>
                            <div style={{ flex: 1 }}></div>
                            <button className="btn-save" onClick={handleSaveRole}>Сохранить изменения</button>
                        </div>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🛡️</div>
                            <h3>Управление ролями</h3>
                            <p>Выберите роль слева, чтобы настроить её права и цвет.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoleSettings;