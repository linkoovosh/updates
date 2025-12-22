import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import settingsReducer from './slices/settingsSlice';
import authReducer from './slices/authSlice';
import chatReducer from './slices/chatSlice';
import serverReducer from './slices/serverSlice';
import voiceReducer from './slices/voiceSlice';
import customThemeReducer from './slices/customThemeSlice';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    settings: settingsReducer,
    auth: authReducer,
    chat: chatReducer,
    server: serverReducer,
    voice: voiceReducer,
    customThemes: customThemeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;