import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { setAuthError } from '../../store/slices/authSlice';
import { setTheme } from '../../store/slices/settingsSlice'; // NEW
import webSocketService from '../../services/websocket';
import { C2S_MSG_TYPE } from '@common/types.js';
import ResizeHandles from '../Layout/ResizeHandles';
import './AuthScreen.css';

// SVG Icons for Theme Toggle (Simplified for brevity)
const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const iconUrls = [
  './murchat.ico',
  './home_default.png',
  './home_open.png',
  './defaul_server_avatars.png',
  './open_server_avatars.png',
];

const FloatingIconsBackground: React.FC = () => {
    const icons = useMemo(() => {
        return Array.from({ length: 100 }).map((_, i) => { // 100 icons
            const randomIcon = iconUrls[Math.floor(Math.random() * iconUrls.length)];
            const size = Math.floor(Math.random() * (60 - 40 + 1)) + 40; // 40px to 60px
            const delay = Math.random() * 10; // 0 to 10 seconds
            const duration = 20 + Math.random() * 20; // 20 to 40 seconds
            const startX = Math.random() * 100; // 0% to 100%

            let glowColor = 'rgba(173, 216, 230, 0.5)'; // Default light blue glow

            switch (randomIcon) {
                case './murchat.ico': // Use relative path
                    glowColor = 'rgba(200, 180, 255, 0.6)'; // Light purple
                    break;
                case './open_server_avatars.png': // Use relative path
                case './home_open.png': // Use relative path
                    glowColor = 'rgba(100, 50, 150, 0.7)'; // Darker purple
                    break;
                default:
                    glowColor = 'rgba(150, 100, 200, 0.5)'; // General purple
                    break;
            }

            return (
                <img
                    key={i}
                    src={randomIcon}
                    alt="icon"
                    className="floating-icon"
                    style={{
                        '--size': `${size}px`,
                        '--delay': `${delay}s`,
                        '--duration': `${duration}s`,
                        '--start-x': `${startX}vw`,
                        '--glow-color': glowColor, // Pass glow color as CSS variable
                        borderRadius: '50%', // Rounded corners
                    } as React.CSSProperties}
                />
            );
        });
    }, []);

    return <div className="floating-icons-background">{icons}</div>;
};

const AuthScreen: React.FC = () => {
  const dispatch = useDispatch();
  const authError = useSelector((state: RootState) => state.auth.authError);
  const verificationRequired = useSelector((state: RootState) => state.auth.authVerificationRequired);
  const { theme: currentTheme, catModeEnabled } = useSelector((state: RootState) => state.settings); // UPDATED

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showThemeHelp, setShowThemeHelp] = useState(false); // NEW

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(setAuthError('')); // Clear previous errors

    if (!email || !password || (!isLogin && !username)) {
      dispatch(setAuthError('Пожалуйста, заполните все поля.'));
      return;
    }

    if (isLogin) {
      webSocketService.login(email, password);
    } else {
      webSocketService.register(email, username, password);
    }
  };

  const handleVerify = (e: React.FormEvent) => {
      e.preventDefault();
      if (verificationCode.length < 6) {
          dispatch(setAuthError('Код должен содержать 6 цифр.'));
          return;
      }
      if (verificationRequired) {
          webSocketService.verifyEmail(verificationRequired.email, verificationCode);
      }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    dispatch(setAuthError(''));
    setEmail('');
    setPassword('');
    setUsername('');
  };

  const handleThemeToggle = () => { // NEW
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    dispatch(setTheme(newTheme));
  };

  if (verificationRequired) {
      return (
        <div className={`auth-container ${catModeEnabled ? 'cat-mode' : ''}`}>
          <FloatingIconsBackground />
          <ResizeHandles />
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '40px', zIndex: 10, WebkitAppRegion: 'drag' }} />
          
          <div className="auth-card" style={{ position: 'relative', zIndex: 20, WebkitAppRegion: 'no-drag' }}>
            <div className="auth-header">
              <h2>Подтверждение Email</h2>
              <p>Мы отправили код на {verificationRequired.email}</p>
              {verificationRequired.message && <p style={{fontSize: '12px', color: 'orange'}}>{verificationRequired.message}</p>}
            </div>
    
            <form onSubmit={handleVerify} className="auth-form">
              <div className="form-group">
                <label htmlFor="code">Код подтверждения</label>
                <input
                  type="text"
                  id="code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
    
              {authError && <div className="auth-error">{authError}</div>}
    
              <button type="submit" className="auth-button">
                Подтвердить
              </button>
            </form>
            
            <div className="auth-footer">
                <p>
                    <span onClick={() => window.location.reload()} className="auth-link">Вернуться назад</span>
                </p>
            </div>

            {/* Theme Toggle Button for Verification Screen */}
            <button className="theme-toggle-button" onClick={handleThemeToggle}>
              {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      );
  }

  return (
    <div className={`auth-container ${catModeEnabled ? 'cat-mode' : ''}`}>
      <FloatingIconsBackground />
      <ResizeHandles />
      {/* Window Drag Region */}
      <div style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '40px', 
          zIndex: 10,
          WebkitAppRegion: 'drag' 
      }} />
      
      <div className="auth-glass-layer"></div>

      <div className="auth-card" style={{ position: 'relative', zIndex: 20, WebkitAppRegion: 'no-drag' }}>
        <div className="auth-header">
          <h2>Добро пожаловать в MurChat</h2>
          <p>{isLogin ? 'Мы рады видеть вас снова!' : 'Присоединяйтесь к лучшему сообществу!'}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="username">Имя пользователя</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Придумайте никнейм"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {authError && <div className="auth-error">{authError}</div>}

          <button type="submit" className="auth-button">
            {isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            <span onClick={toggleMode} className="auth-link">
              {isLogin ? 'Зарегистрироваться' : 'Войти'}
            </span>
          </p>
        </div>

        {/* Theme Toggle Button */}
        <button className="theme-toggle-button" onClick={handleThemeToggle}>
          {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
