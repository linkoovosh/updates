import React, { useState, useEffect } from 'react';
import './LoadingScreen.css';

const LoadingScreen: React.FC = () => {
  const [statusText, setStatusText] = useState('Загрузка...'); // Changed default text

  useEffect(() => {
    if (window.electron) {
      const handleUpdateMessage = (text: unknown) => {
        if (typeof text === 'string') {
          setStatusText(text);
        }
      };
      
      window.electron.receive('update-message', handleUpdateMessage);
    }

    const handleSyncUpdate = (e: any) => {
        if (e.detail) setStatusText(e.detail);
    };

    window.addEventListener('murchat-sync-update', handleSyncUpdate);
    return () => {
        window.removeEventListener('murchat-sync-update', handleSyncUpdate);
    };
  }, []);

  return (
    <div className="loading-screen">
      {/* Video removed for performance */}
      <div className="loading-text">{statusText}</div>
    </div>
  );
};

export default LoadingScreen;
