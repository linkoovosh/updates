import React from 'react';
import { useDispatch } from 'react-redux';
import { setUserProfileForId } from '../../store/slices/authSlice';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import { MicIcon } from '../UI/Icons';
import { Badge } from '../Badge/Badge';
import type { Channel } from '@common/types';
import type { AppDispatch } from '../../store';

// Sub-component for individual voice channels to safely use hooks and prevent crashes
const VoiceChannelItem: React.FC<{
    channel: Channel;
    activeVoiceChannelId: string | null;
    voiceStates: any;
    users: any;
    vadThreshold: number;
    selectedChannelId: string | null;
    unreadCounts: any;
    onVoiceClick: (channel: Channel) => void;
    onContextMenu: (e: React.MouseEvent, channel: Channel) => void;
    getChannelBadge: (id: string) => React.ReactNode;
}> = ({ 
    channel, activeVoiceChannelId, voiceStates, users, vadThreshold, 
    selectedChannelId, unreadCounts, onVoiceClick, onContextMenu, 
    getChannelBadge
}) => {
    const dispatch: AppDispatch = useDispatch();

    // Memoize members for THIS specific channel - defined at top level of component
    const channelMembers = React.useMemo(() => {
        if (!voiceStates) return [];
        return Object.keys(voiceStates).filter(id => {
            const state = voiceStates[id];
            return state && state.channelId === channel.id;
        });
    }, [voiceStates, channel.id]);

    const VoiceChannelIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="channel-icon-svg">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
    );

    return (
        <div key={channel.id}>
            <div 
                className={`channel-item voice ${activeVoiceChannelId === channel.id ? 'active-voice' : ''} ${(unreadCounts || {})[channel.id] > 0 ? 'unread' : ''}`} 
                onClick={() => onVoiceClick(channel)}
                onContextMenu={(e) => onContextMenu(e, channel)}
            >
                <span className="channel-icon"><VoiceChannelIcon /></span> {channel.name} {channel.isPrivate && <span style={{ marginLeft: 'auto' }}><LockIconFix /></span>}
                {getChannelBadge(channel.id)}
            </div>
            {channelMembers.length > 0 && (
                <div className="voice-channel-members">
                    {channelMembers.map(memberId => {
                        const state = voiceStates[memberId];
                        if (!state) return null;
                        
                        const normalizedThreshold = (vadThreshold / 100) * 0.5;
                        const isSpeaking = (state.volume || 0) > normalizedThreshold && !state.isMuted;
                        const user = users[memberId];
                        const displayName = state.username || user?.username || memberId.substring(0, 8);
                        const avatarUrl = state.avatar || user?.avatar;
                        const hasAvatar = !!avatarUrl && avatarUrl !== 'null' && avatarUrl !== 'undefined';

                        return (
                            <div key={memberId} className={`voice-member ${isSpeaking ? 'speaking' : ''}`} onClick={(e) => { e.stopPropagation(); dispatch(setUserProfileForId(memberId)); }}>
                                <div className="member-avatar-wrapper">
                                    <div className="member-avatar" style={{ backgroundColor: generateAvatarColor(memberId) }}>
                                        {hasAvatar ? <img src={avatarUrl} alt={displayName} /> : getInitials(displayName)}
                                    </div>
                                    {state.isMuted && <span className="voice-state-icon">🔇</span>}
                                </div>
                                <span className="member-name">{displayName}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const LockIconFix = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
);

export default VoiceChannelItem;
