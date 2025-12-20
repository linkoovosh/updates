import { useState, useEffect } from 'react';
import './App.css';
import LoadingScreen from './components/LoadingScreen';
import AuthScreen from './components/Auth/AuthScreen'; // Import AuthScreen
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from './store';
import { loadSettings } from './store/slices/settingsSlice';
import { closeServerSettings, setSelectedServerId, setSelectedChannelId } from './store/slices/serverSlice';
import { setSettingsPanelOpen } from './store/slices/uiSlice';
import webSocketService from './services/websocket';
import AppLayout from './components/Layout/AppLayout';
import ServerSettingsDialog from './components/Servers/ServerSettingsDialog';
import SettingsPanel from './components/Settings/SettingsPanel';
import StatusMenu from './components/StatusMenu/StatusMenu'; // Import StatusMenu
import ChangelogModal from './components/Changelog/ChangelogModal'; // NEW
import ConnectionInfoPanel from './components/UserPanel/ConnectionInfoPanel'; // NEW
import ShutdownScreen from './components/ShutdownScreen/ShutdownScreen'; // NEW
import SharedBrowserStage from './components/Voice/SharedBrowserStage'; // NEW
import UpdateNotifier from './components/Layout/UpdateNotifier'; // NEW
import { changelog } from './changelog'; // NEW
import { logService } from './services/LogService'; // NEW
import { playHoverSound } from './utils/soundUtils'; // NEW

// Initialize logging immediately
logService.init();

declare global {
  interface Window {
    electron?: {
      send: (channel: string, data: unknown) => void;
      receive: (channel: string, func: (...args: unknown[]) => void) => void;
      writeToClipboard: (text: string) => void; // NEW
      getScreenSources: () => Promise<{ id: string; name: string; thumbnail: string }[]>; // NEW
      getCurrentWindowSourceId: () => Promise<string | null>; // NEW
      saveSettings: (settings: any) => Promise<any>;
      loadSettings: () => Promise<any>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [showChangelog, setShowChangelog] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false); // NEW

  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const userId = useSelector((state: RootState) => state.auth.userId); // Add userId
  const username = useSelector((state: RootState) => state.auth.username); // Add username
  const serverSettingsDialog = useSelector((state: RootState) => state.server.serverSettingsDialog);
  const isSettingsPanelOpen = useSelector((state: RootState) => state.ui.isSettingsPanelOpen);
  const isStatusMenuOpen = useSelector((state: RootState) => state.auth.isStatusMenuOpen);
  const settings = useSelector((state: RootState) => state.settings);
  const selectedServerId = useSelector((state: RootState) => state.server.selectedServerId);
  const selectedChannelId = useSelector((state: RootState) => state.server.selectedChannelId);
  const dispatch: AppDispatch = useDispatch();

  // Sync user with LogService
  useEffect(() => {
      console.log('App: User sync effect triggered', { userId, username });
      if (userId && username) {
          logService.setUser(userId, username);
      }
  }, [userId, username]);

  // Handle graceful shutdown
  useEffect(() => {
      if (window.electron) {
          window.electron.receive('app-closing', async () => {
              console.log('Received app-closing signal. Starting graceful shutdown...');
              setIsShuttingDown(true); // Show kittens
              
              // 1. Force upload logs
              try {
                  await logService.forceUpload();
              } catch (e) {
                  console.error('Failed to upload logs during shutdown', e);
              }

              // 2. Wait 5 seconds as requested
              await new Promise(resolve => setTimeout(resolve, 5000));

              // 3. Tell main process we are ready
              window.electron.send('app-ready-to-quit', true);
          });
      }
  }, []);

  // Global Hover Sounds
  useEffect(() => {
      let lastHoveredElement: Element | null = null;

      const handleMouseOver = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!target) return;

          // Define selectors for interactive elements
          const interactiveSelectors = [
              'button', 'a', 'select', 'input[type="checkbox"]', 'input[type="radio"]',
              '.server-icon', '.channel-item', '.voice-member', '.settings-sidebar-item',
              '.theme-card', '.holo-btn', '.icon-btn', '.friend-tab', '.friend-item',
              '.context-item', '.user-info', '.control-button', '.magic-create-theme-btn'
          ];

          const hoveredInteractive = target.closest(interactiveSelectors.join(','));

          if (hoveredInteractive && hoveredInteractive !== lastHoveredElement) {
              playHoverSound();
              lastHoveredElement = hoveredInteractive;
          } else if (!hoveredInteractive) {
              lastHoveredElement = null;
          }
      };

      document.addEventListener('mouseover', handleMouseOver);
      return () => document.removeEventListener('mouseover', handleMouseOver);
  }, []);

  // 1. Init App (Load settings & Connect WS)
  useEffect(() => {
    const initApp = async () => {
        // Load settings first
        if (window.electron) {
            try {
                const fileSettings = await window.electron.loadSettings();
                if (fileSettings) dispatch(loadSettings(fileSettings));
            } catch (e) {
                console.error("Failed to load settings:", e);
            }
        } else {
            const savedSettings = localStorage.getItem('murchat-settings');
            if (savedSettings) dispatch(loadSettings(JSON.parse(savedSettings)));
        }

        // Restore UI State
        const savedUiState = localStorage.getItem('murchat-ui-state');
        if (savedUiState) {
            try {
                const { serverId, channelId } = JSON.parse(savedUiState);
                if (serverId) dispatch(setSelectedServerId(serverId));
                if (channelId) dispatch(setSelectedChannelId(channelId));
            } catch (e) { console.error("Failed to restore UI state:", e); }
        }

        // Connect WS
        console.log('App: Connecting WebSocket...');
        webSocketService.connect();

        // App is ready to show UI
        setIsLoading(false);
    };

    initApp();
  }, [dispatch]);

  // Check for updates/changelog
  useEffect(() => {
    // Show changelog on every launch as requested
    setShowChangelog(true);
    
    // Check for updates via Electron
    if (window.electron) {
        window.electron.receive('update-message', (text) => {
            console.log('Update message:', text);
        });
    }
  }, []);

  const handleChangelogClose = () => {
      setShowChangelog(false);
      localStorage.setItem('murchat-last-version', changelog[0].version);
  };

  // Save UI State
  useEffect(() => {
      if (isLoading) return;
      const uiState = { serverId: selectedServerId, channelId: selectedChannelId };
      localStorage.setItem('murchat-ui-state', JSON.stringify(uiState));
  }, [selectedServerId, selectedChannelId, isLoading]);

  // Prevent layout shifts
  useEffect(() => {
    const handleFocus = () => { window.scrollTo(0, 0); document.body.scrollTop = 0; };
    window.addEventListener('focusin', handleFocus);
    return () => window.removeEventListener('focusin', handleFocus);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Home') {
              setShowChangelog(true);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply Settings
  useEffect(() => {
    if (isLoading) return;
    if (window.electron) window.electron.saveSettings(settings);
    localStorage.setItem('murchat-settings', JSON.stringify(settings));

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(settings.theme);
    
    if (settings.animationsEnabled) root.classList.add('animations-enabled');
    else root.classList.remove('animations-enabled');

    root.style.setProperty('--font-main', settings.font);
    root.style.fontSize = `${settings.fontSize}px`;
    root.style.setProperty('--zoom-level', String(settings.uiScale));
    
    const roundnessMap = {
      small: { '--radius-small': '4px', '--radius-medium': '6px', '--radius-large': '8px' },
      medium: { '--radius-small': '6px', '--radius-medium': '10px', '--radius-large': '16px' },
      large: { '--radius-small': '8px', '--radius-medium': '16px', '--radius-large': '24px' },
    };
    const selectedRoundness = roundnessMap[settings.uiRoundness] || roundnessMap.medium;
    Object.entries(selectedRoundness).forEach(([key, value]) => root.style.setProperty(key, value));

    const hexToRgb = (hex: string): string => {
        if (hex === 'transparent') return '0, 0, 0'; // Fallback for RGB vars
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
    };

    root.style.setProperty('--blur-intensity', `${settings.blurIntensity * 15}px`);
    root.style.setProperty('--blur-intensity-strong', `${settings.blurIntensity * 20}px`);
    
    const finalOpacity = settings.enableTransparency ? settings.appOpacity : 1;
    root.style.setProperty('--app-opacity', String(finalOpacity));
    root.style.setProperty('--accent-blue', settings.accentColor);
    root.style.setProperty('--accent-blue-rgb', hexToRgb(settings.accentColor));

    if (settings.catModeEnabled) {
        root.classList.add('cat-mode');
    } else {
        root.classList.remove('cat-mode');
    }

    const themeColors = getComputedStyle(root);
    root.style.setProperty('--bg-primary-rgb', hexToRgb(themeColors.getPropertyValue('--bg-primary').trim()));
    root.style.setProperty('--bg-context-menu-rgb', hexToRgb(themeColors.getPropertyValue('--bg-context-menu').trim()));
    root.style.setProperty('--bg-input-rgb', hexToRgb(themeColors.getPropertyValue('--bg-input').trim()));
    root.style.setProperty('--bg-elevated-rgb', hexToRgb(themeColors.getPropertyValue('--bg-elevated').trim()));
    root.style.setProperty('--bg-modifier-accent-rgb', hexToRgb(themeColors.getPropertyValue('--bg-modifier-accent').trim()));
    root.style.setProperty('--bg-modifier-hover-rgb', hexToRgb(themeColors.getPropertyValue('--bg-modifier-hover').trim()));
    root.style.setProperty('--status-positive-rgb', hexToRgb(themeColors.getPropertyValue('--status-positive').trim()));
    root.style.setProperty('--status-negative-rgb', hexToRgb(themeColors.getPropertyValue('--status-negative').trim()));
    root.style.setProperty('--status-warning-rgb', hexToRgb(themeColors.getPropertyValue('--status-warning').trim()));

    root.classList.remove('glass-solid', 'glass-soft', 'glass-liquid-ios');
    root.classList.add(`glass-${settings.glassMaterial}`);

  }, [settings]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isShuttingDown) {
      return <ShutdownScreen />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <>
      <AppLayout />
      <ConnectionInfoPanel />
      <UpdateNotifier />
      {serverSettingsDialog.isOpen && serverSettingsDialog.serverId && (
        <ServerSettingsDialog 
            serverId={serverSettingsDialog.serverId} 
            onClose={() => dispatch(closeServerSettings())} 
        />
      )}
      {isSettingsPanelOpen && (
          <SettingsPanel isOpen={isSettingsPanelOpen} onClose={() => dispatch(setSettingsPanelOpen(false))} />
      )}
      {isStatusMenuOpen && <StatusMenu />}
      {showChangelog && (
          <ChangelogModal
              isOpen={showChangelog}
              onClose={handleChangelogClose}
              version={changelog[0].version}
              changes={changelog[0].changes}
              title={changelog[0].title}
          />
      )}
    </>
  );
}

export default App;
