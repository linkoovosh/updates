import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import './FriendsView.css';
import webSocketService from "../../services/websocket";
import { C2S_MSG_TYPE } from '@common/types';
import type { AddFriendPayload, AcceptFriendRequestPayload, RejectFriendRequestPayload, RemoveFriendPayload } from '@common/types';
import { generateAvatarColor, getInitials } from "../../utils/avatarUtils";

type Tab = 'online' | 'all' | 'pending' | 'add'; // 'add' tab is back

interface FriendsViewProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const FriendsView: React.FC<FriendsViewProps> = ({ activeTab, setActiveTab }) => {
  const { friends, incomingRequests, outgoingRequests } = useSelector((state: RootState) => state.auth);
  const [friendInput, setFriendInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSendRequest = () => {
      // Validation
      if (!friendInput.includes('#')) {
          setStatusMsg({ type: 'error', text: "Неверный формат. Используйте Ник#0000" });
          return;
      }
      
      const [username, discriminator] = friendInput.split('#');
      if (!discriminator || discriminator.length !== 4) {
          setStatusMsg({ type: 'error', text: "Тег должен состоять из 4 цифр" });
          return;
      }

      const payload: AddFriendPayload = { username, discriminator };
      webSocketService.sendMessage(C2S_MSG_TYPE.ADD_FRIEND, payload);
      
      setStatusMsg({ type: 'success', text: `Запрос отправлен пользователю ${username}#${discriminator}` });
      setFriendInput('');
  };

  const handleAccept = (userId: string) => {
      webSocketService.sendMessage(C2S_MSG_TYPE.ACCEPT_FRIEND_REQUEST, { userId } as AcceptFriendRequestPayload);
  };

  const handleReject = (userId: string) => {
      webSocketService.sendMessage(C2S_MSG_TYPE.REJECT_FRIEND_REQUEST, { userId } as RejectFriendRequestPayload);
  };

  const handleRemoveFriend = (friendId: string, username: string) => {
      if (confirm(`Удалить ${username} из друзей?`)) {
          webSocketService.sendMessage(C2S_MSG_TYPE.REMOVE_FRIEND, { friendId } as RemoveFriendPayload);
      }
  };

  const renderContent = () => {
      if (activeTab === 'add') {
          return (
            <div className="add-friend-container">
                <div className="add-friend-header">
                    <h2>Добавить друга</h2>
                    <p>Вы можете добавить друга, используя его MurChat Tag. Это чувствительно к регистру!</p>
                </div>
                <div className={`add-friend-input-wrapper ${statusMsg?.type === 'success' ? 'success' : ''} ${statusMsg?.type === 'error' ? 'error' : ''}`}>
                    <input 
                        placeholder="Введите ИмяПользователя#0000" 
                        value={friendInput}
                        onChange={(e) => { setFriendInput(e.target.value); setStatusMsg(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
                    />
                    <button disabled={!friendInput} onClick={handleSendRequest}>Добавить в друзья</button>
                </div>
                {statusMsg && (
                    <div className={statusMsg.type === 'success' ? 'success-message' : 'error-message'}>
                        {statusMsg.text}
                    </div>
                )}
            </div>
          );
      }

      if (activeTab === 'pending') {
          if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
              return <div className="empty-state"><p>Нет ожидающих заявок.</p></div>;
          }
          return (
              <div className="friend-list-container">
                  {incomingRequests.length > 0 && <div className="list-header">Входящие — {incomingRequests.length}</div>}
                  {incomingRequests.map(user => (
                      <div key={user.id} className="friend-item">
                          <div className="friend-info">
                              <div className="friend-avatar" style={{ backgroundColor: generateAvatarColor(user.id) }}>
                                  {getInitials(user.username)}
                              </div>
                              <div className="friend-text">
                                  <div className="friend-name">{user.username}<span className="friend-discriminator">#{user.discriminator}</span></div>
                                  <div className="friend-status">Входящий запрос</div>
                              </div>
                          </div>
                          <div className="friend-actions">
                              <button className="action-btn accept" onClick={() => handleAccept(user.id)} title="Принять">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              </button>
                              <button className="action-btn reject" onClick={() => handleReject(user.id)} title="Отклонить">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              </button>
                          </div>
                      </div>
                  ))}

                  {outgoingRequests.length > 0 && <div className="list-header">Исходящие — {outgoingRequests.length}</div>}
                  {outgoingRequests.map(user => (
                      <div key={user.id} className="friend-item">
                          <div className="friend-info">
                              <div className="friend-avatar" style={{ backgroundColor: generateAvatarColor(user.id) }}>
                                  {getInitials(user.username)}
                              </div>
                              <div className="friend-text">
                                  <div className="friend-name">{user.username}<span className="friend-discriminator">#{user.discriminator}</span></div>
                                  <div className="friend-status">Исходящий запрос</div>
                              </div>
                          </div>
                          <div className="friend-actions">
                              <button className="action-btn reject" onClick={() => handleReject(user.id)} title="Отменить">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          );
      }

      // Online / All
      const list = activeTab === 'online' ? friends.filter(f => f.status !== 'offline') : friends;
      
      if (list.length === 0) {
          return (
            <div className="empty-state">
                <p style={{ color: 'var(--text-secondary)' }}>Здесь пока никого нет.</p>
            </div>
          );
      }

      return (
          <div className="friend-list-container">
              <div className="list-header">{activeTab === 'online' ? 'В сети' : 'Все друзья'} — {list.length}</div>
              {list.map(user => (
                  <div key={user.id} className="friend-item hoverable">
                      <div className="friend-info">
                          <div className="friend-avatar" style={{ backgroundColor: generateAvatarColor(user.id) }}>
                              {getInitials(user.username)}
                          </div>
                          <div className="friend-text">
                              <div className="friend-name">{user.username}<span className="friend-discriminator">#{user.discriminator}</span></div>
                              <div className="friend-status">{user.status || 'Offline'}</div>
                          </div>
                      </div>
                      <div className="friend-actions">
                          <button className="action-btn message" title="Сообщение">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                          </button>
                          <button className="action-btn reject" onClick={() => handleRemoveFriend(user.id, user.username)} title="Удалить из друзей">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      );
  };

  return (
    <div className="friends-view">
      <div className="friends-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default FriendsView;
