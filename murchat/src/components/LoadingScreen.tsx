import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import './LoadingScreen.css';

const LoadingScreen: React.FC = () => {
  const [statusText, setStatusText] = useState('Синхронизация систем...');
  const [showSkip, setShowSkip] = useState(false);
  const catMode = useSelector((state: RootState) => state.settings.catModeEnabled);

  useEffect(() => {
    // Show skip button after 5 seconds of hanging
    const timer = setTimeout(() => setShowSkip(true), 5000);

    if (window.electron) {
      const handleUpdateMessage = (text: unknown) => {
        if (typeof text === 'string') setStatusText(text);
      };
      window.electron.receive('update-message', handleUpdateMessage);
    }

    const handleSyncUpdate = (e: any) => {
        if (e.detail) setStatusText(e.detail);
    };

    window.addEventListener('murchat-sync-update', handleSyncUpdate);
    return () => {
        clearTimeout(timer);
        window.removeEventListener('murchat-sync-update', handleSyncUpdate);
    };
  }, []);

  const handleSkip = () => {
      // Dispatch a custom event to App.tsx to force loading completion
      window.dispatchEvent(new CustomEvent('murchat-force-start'));
  };

  return (
    <div className={`loading-screen liquid-glass ${catMode ? 'cat-mode' : ''}`}>
      <div className="loading-container">
        <div className="loading-logo">
            <div className="logo-glow"></div>
            <img src="https://lh3.googleusercontent.com/a-/ALV-UjXXixsPT7S50HzxmbFn0p1jcDlyDaBQKONr_RLULJDonpDgKQE=s40-p" alt="MurCHAT" />
        </div>
        
        <div className="loading-content">
            <h2 className="loading-title">MurCHAT</h2>
            <div className="loading-bar-wrapper">
                <div className="loading-bar-fill"></div>
            </div>
            <div className="loading-status">{statusText}</div>
            
            {showSkip && (
                <button className="skip-loading-btn" onClick={handleSkip}>
                    Пропустить загрузку
                </button>
            )}
        </div>
      </div>
      
      <div className="loading-bg-elements">
          <div className="bg-circle c1"></div>
          <div className="bg-circle c2"></div>
      </div>
    </div>
  );
};

export default LoadingScreen;
