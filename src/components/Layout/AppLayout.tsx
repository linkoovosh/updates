import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import TopBar from '../TopBar/TopBar';
import ServersBar from '../Servers/ServersBar';
import ChannelsSidebar from '../Channels/ChannelsSidebar';
import ChatView from '../ChatView/ChatView';
import MembersSidebar from '../Members/MembersSidebar';
import FriendsView from '../Friends/FriendsView';
import DmChatView from '../Dms/DmChatView'; 
import ResizeHandles from './ResizeHandles';
import VoiceManager from '../VoiceManager';
import UserProfilePopup from '../UserProfilePopup/UserProfilePopup';
import UserPanel from '../UserPanel/UserPanel';
import IncomingCallModal from '../VoicePanel/IncomingCallModal'; 
import VoiceStage from '../VoiceStage/VoiceStage'; 
import InviteModal from '../Invites/InviteModal'; 
import AccessDeniedModal from '../UI/AccessDeniedModal'; // NEW
import { setInviteModalServerId } from '../../store/slices/uiSlice'; 
import './AppLayout.css';

type Tab = 'online' | 'all' | 'pending' | 'add';

interface AppLayoutProps {
  className?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ className }) => {
  const dispatch: AppDispatch = useDispatch();
  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const channels = useSelector((state: RootState) => state.ui.channels); 
  const activeDmConversationId = useSelector((state: RootState) => state.chat.activeDmConversationId);
  const userProfileOpenForId = useSelector((state: RootState) => state.auth.userProfileOpenForId);
  const showMembersSidebar = useSelector((state: RootState) => state.ui.showMembersSidebar);
  const inviteModalServerId = useSelector((state: RootState) => state.ui.inviteModalServerId);
  const showAccessDenied = useSelector((state: RootState) => state.ui.showAccessDenied); // NEW

  const [activeFriendTab, setActiveFriendTab] = useState<Tab>('online');

  const renderMainView = () => {
    if (selectedServerId === null) {
      if (activeDmConversationId) {
        return <DmChatView />;
      }
      return <FriendsView activeTab={activeFriendTab} setActiveTab={setActiveFriendTab} />;
    }
    
    if (selectedServerId !== null) {
      if (selectedChannelId) {
        const selectedChannel = channels.find(c => c.id === selectedChannelId);
        
        if (selectedChannel && selectedChannel.type === 'voice') {
            return <VoiceStage />;
        }

        return (
          <>
            <ChatView />
            {showMembersSidebar && <MembersSidebar />}
          </>
        );
      } else {
        return (
            <div className="welcome-server-view">
                <p>Выберите канал, чтобы начать общение.</p>
            </div>
        );
      }
    }
    return <div className="loading-placeholder">Загрузка...</div>;
  };

  return (
    <div className={`app-layout ${className || ''}`}>
      <VoiceManager /> 
      <ResizeHandles />
      
      <div className="left-nav-container">
        <div className="left-nav-top">
          <ServersBar activeFriendTab={activeFriendTab} setActiveFriendTab={setActiveFriendTab} />
          <div className="sidebar-column glass-panel">
            <ChannelsSidebar />
          </div>
        </div>
        <UserPanel /> 
      </div>

      <div className="main-column">
        <TopBar activeFriendTab={activeFriendTab} setActiveFriendTab={setActiveFriendTab} />
        <div className="content-area">
          {renderMainView()}
        </div>
      </div>

      <IncomingCallModal />
      {userProfileOpenForId && <UserProfilePopup userId={userProfileOpenForId} />}
      {showAccessDenied && <AccessDeniedModal />}
      {inviteModalServerId && (
          <InviteModal 
            isOpen={!!inviteModalServerId} 
            onClose={() => dispatch(setInviteModalServerId(null))} 
            serverId={inviteModalServerId} 
          />
      )}
    </div>
  );
};

export default AppLayout;
