// src/store/slices/settingsSlice.ts
import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// --- Type Exports ---
export type Theme = 'system' | 'light' | 'dark';
export type Font = 'Inter' | 'Roboto' | 'System';
export type UiRoundness = 'small' | 'medium' | 'large';
export type PrivacySetting = 'all' | 'friends' | 'none';
export type GlassMaterial = 'solid' | 'soft' | 'liquid-ios';

export interface SettingsState {
  // --- Appearance ---
  theme: Theme;
  uiScale: number;
  font: Font;
  fontSize: number;
  uiRoundness: UiRoundness;
  animationsEnabled: boolean;
  blurIntensity: number;
  enableTransparency: boolean;
  glassMaterial: GlassMaterial; // New setting
  appOpacity: number; // 0.5 - 1.0
  accentColor: string; // Hex code
  isTerminalVisible: boolean;
  catModeEnabled: boolean; // NEW: Nyashny mode
  
  // --- Voice & Video ---
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  videoDeviceId: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  pushToTalk: boolean;
  inputVolume: number;
  vadThreshold: number;
  
  // --- Screen Share ---
  screenShareResolution: '720p' | '1080p' | '1440p' | '2160p';
  screenShareFps: 15 | 30 | 60;

  // --- Privacy & Security ---
  pmPrivacy: PrivacySetting;
  friendRequestPrivacy: PrivacySetting;

  // --- Notifications ---
  enableDesktopNotifications: boolean;
  enableSoundNotifications: boolean;
  notifyOnMention: boolean;
  notifyOnDm: boolean;
  playUserJoinLeaveSounds: boolean;
}

const initialState: SettingsState = {
  // Appearance
  theme: 'dark', // Force dark for best glass effect
  uiScale: 1,
  font: 'Inter',
  fontSize: 16,
  uiRoundness: 'large', // More rounded
  animationsEnabled: true,
  blurIntensity: 0.6, 
  enableTransparency: true, 
  glassMaterial: 'liquid-ios', 
  appOpacity: 0.85, 
  accentColor: '#4D7CFF', // Default Blue
  isTerminalVisible: false,
  catModeEnabled: true,

  // Voice & Video
  inputDeviceId: null,
  outputDeviceId: null,
  videoDeviceId: null,
  noiseSuppression: true,
  echoCancellation: true,
  pushToTalk: false,
  inputVolume: 100,
  vadThreshold: 5,
  
  // Screen Share
  screenShareResolution: '1080p',
  screenShareFps: 30,

  // Privacy & Security
  pmPrivacy: 'all',
  friendRequestPrivacy: 'all',

  // Notifications
  enableDesktopNotifications: true,
  enableSoundNotifications: true,
  notifyOnMention: true,
  notifyOnDm: true,
  playUserJoinLeaveSounds: true,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // --- Appearance ---
    setTheme: (state, action: PayloadAction<Theme>) => { state.theme = action.payload; },
    setUiScale: (state, action: PayloadAction<number>) => { state.uiScale = action.payload; },
    setFont: (state, action: PayloadAction<Font>) => { state.font = action.payload; },
    setFontSize: (state, action: PayloadAction<number>) => { state.fontSize = action.payload; },
    setUiRoundness: (state, action: PayloadAction<UiRoundness>) => { state.uiRoundness = action.payload; },
    setAnimationsEnabled: (state, action: PayloadAction<boolean>) => { state.animationsEnabled = action.payload; },
    setBlurIntensity: (state, action: PayloadAction<number>) => { state.blurIntensity = action.payload; },
    setEnableTransparency: (state, action: PayloadAction<boolean>) => { state.enableTransparency = action.payload; },
    setGlassMaterial: (state, action: PayloadAction<GlassMaterial>) => { state.glassMaterial = action.payload; },
    setAppOpacity: (state, action: PayloadAction<number>) => { state.appOpacity = action.payload; },
    setAccentColor: (state, action: PayloadAction<string>) => { state.accentColor = action.payload; },
    setIsTerminalVisible: (state, action: PayloadAction<boolean>) => { state.isTerminalVisible = action.payload; },
    setCatModeEnabled: (state, action: PayloadAction<boolean>) => { state.catModeEnabled = action.payload; },

    // --- Voice & Video ---
    setInputDeviceId: (state, action: PayloadAction<string | null>) => { state.inputDeviceId = action.payload; },
    setOutputDeviceId: (state, action: PayloadAction<string | null>) => { state.outputDeviceId = action.payload; },
    setVideoDeviceId: (state, action: PayloadAction<string | null>) => { state.videoDeviceId = action.payload; },
    setNoiseSuppression: (state, action: PayloadAction<boolean>) => { state.noiseSuppression = action.payload; },
    setEchoCancellation: (state, action: PayloadAction<boolean>) => { state.echoCancellation = action.payload; },
    setPushToTalk: (state, action: PayloadAction<boolean>) => { state.pushToTalk = action.payload; },
    setInputVolume: (state, action: PayloadAction<number>) => { state.inputVolume = action.payload; },
    setVadThreshold: (state, action: PayloadAction<number>) => { state.vadThreshold = action.payload; },
    
    // --- Screen Share ---
    setScreenShareResolution: (state, action: PayloadAction<'720p' | '1080p' | '1440p' | '2160p'>) => { state.screenShareResolution = action.payload; },
    setScreenShareFps: (state, action: PayloadAction<15 | 30 | 60>) => { state.screenShareFps = action.payload; },

    // --- Privacy & Security ---
    setPmPrivacy: (state, action: PayloadAction<PrivacySetting>) => { state.pmPrivacy = action.payload; },
    setFriendRequestPrivacy: (state, action: PayloadAction<PrivacySetting>) => { state.friendRequestPrivacy = action.payload; },

    // --- Notifications ---
    setEnableDesktopNotifications: (state, action: PayloadAction<boolean>) => { state.enableDesktopNotifications = action.payload; },
    setEnableSoundNotifications: (state, action: PayloadAction<boolean>) => { state.enableSoundNotifications = action.payload; },
    setNotifyOnMention: (state, action: PayloadAction<boolean>) => { state.notifyOnMention = action.payload; },
    setNotifyOnDm: (state, action: PayloadAction<boolean>) => { state.notifyOnDm = action.payload; },
    setPlayUserJoinLeaveSounds: (state, action: PayloadAction<boolean>) => { state.playUserJoinLeaveSounds = action.payload; },
    
    // --- General ---
    loadSettings: (state, action: PayloadAction<Partial<SettingsState>>) => {
      return { ...state, ...action.payload };
    }
  },
});

export const {
  // Appearance
  setTheme, setUiScale, setFont, setFontSize, setUiRoundness, setAnimationsEnabled, setBlurIntensity, setIsTerminalVisible,
  setAppOpacity, setAccentColor, setEnableTransparency, setGlassMaterial, setCatModeEnabled,
  // Voice & Video
  setInputDeviceId, setOutputDeviceId, setVideoDeviceId, setNoiseSuppression, setEchoCancellation, setPushToTalk,
  setInputVolume, setVadThreshold, setScreenShareResolution, setScreenShareFps,
  // Privacy & Security
  setPmPrivacy, setFriendRequestPrivacy,
  // Notifications
  setEnableDesktopNotifications, setEnableSoundNotifications, setNotifyOnMention, setNotifyOnDm, setPlayUserJoinLeaveSounds,
  // General
  loadSettings
} = settingsSlice.actions;
export default settingsSlice.reducer;