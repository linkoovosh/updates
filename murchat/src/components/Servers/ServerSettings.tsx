import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import websocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from "@common/types";
import type { UpdateServerProfilePayload, Server } from "@common/types";
import "./ServerSettings.css";
import DefaulServerAvatars from '/defaul_server_avatars.png';
import OpenServerAvatars from '/open_server_avatars.png';

const ServerSettings = () => {
    const selectedServerId = useSelector((state: RootState) => state.ui.selectedServerId);
    const servers = useSelector((state: RootState) => state.ui.servers);
    const userId = useSelector((state: RootState) => state.ui.userId);

    const selectedServer = servers.find(s => s.id === selectedServerId);

    const [defaultAvatarPreview, setDefaultAvatarPreview] = useState<string | undefined>(selectedServer?.avatar_default);
    const [activeAvatarPreview, setActiveAvatarPreview] = useState<string | undefined>(selectedServer?.avatar_active);

    useEffect(() => {
        setDefaultAvatarPreview(selectedServer?.avatar_default);
        setActiveAvatarPreview(selectedServer?.avatar_active);
    }, [selectedServerId, selectedServer]);

    const isOwner = selectedServer && selectedServer.ownerId === userId;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, avatarType: 'default' | 'active') => {
        const file = e.target.files?.[0];
        if (!file || !selectedServer) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64String = event.target?.result as string;
            if (avatarType === 'default') {
                setDefaultAvatarPreview(base64String);
                websocketService.sendMessage(C2S_MSG_TYPE.UPDATE_SERVER_PROFILE, {
                    serverId: selectedServer.id,
                    avatar_default: base64String
                });
            } else {
                setActiveAvatarPreview(base64String);
                websocketService.sendMessage(C2S_MSG_TYPE.UPDATE_SERVER_PROFILE, {
                    serverId: selectedServer.id,
                    avatar_active: base64String
                });
            }
        };
        reader.readAsDataURL(file);
    };

    if (!isOwner) {
        return <div className="server-settings-container"><p>You do not have permission to edit this server's settings.</p></div>;
    }
    
    if (!selectedServer) {
        return null;
    }

    return (
        <div className="server-settings-container">
            <h3>Server Avatars</h3>
            <p>Here you can change the default and active avatars for your server.</p>

            <div className="avatar-upload-section">
                <h4>Default Avatar</h4>
                <p>Shown when the server is not selected.</p>
                <div className="avatar-preview" style={{ backgroundImage: `url(${defaultAvatarPreview || DefaulServerAvatars})` }}>
                    {!defaultAvatarPreview && !selectedServer.avatar_default && <span>None</span>}
                </div>
                <input 
                    type="file" 
                    accept="image/*" 
                    id="default-avatar-upload" 
                    onChange={(e) => handleFileChange(e, 'default')} 
                />
                <label htmlFor="default-avatar-upload" className="upload-button">Upload Image</label>
            </div>

            <div className="avatar-upload-section">
                <h4>Active Avatar</h4>
                <p>Shown when the server is selected.</p>
                <div className="avatar-preview" style={{ backgroundImage: `url(${activeAvatarPreview || OpenServerAvatars})` }}>
                    {!activeAvatarPreview && !selectedServer.avatar_active && <span>None</span>}
                </div>
                <input 
                    type="file" 
                    accept="image/*" 
                    id="active-avatar-upload" 
                    onChange={(e) => handleFileChange(e, 'active')}
                />
                <label htmlFor="active-avatar-upload" className="upload-button">Upload Image</label>
            </div>
        </div>
    );
};

export default ServerSettings;
