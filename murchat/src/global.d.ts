import 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}

interface ElectronAPI {
  send: (channel: string, data: unknown) => void;
  receive: (channel: string, func: (...args: unknown[]) => void) => void;
  writeToClipboard: (text: string) => void;
  getScreenSources: () => Promise<{ id: string; name: string; thumbnail: string }[]>;
  getCurrentWindowSourceId: () => Promise<string | null>; // NEW
  saveSettings: (settings: any) => Promise<{ success: boolean; error?: any }>;
  loadSettings: () => Promise<any>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}