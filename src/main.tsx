import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Provider } from 'react-redux';
import { store } from './store';
import webSocketService from './services/websocket'; // Import the service

// Initialize the WebSocket service with the store's methods
webSocketService.setStore(store.dispatch, store.getState);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)