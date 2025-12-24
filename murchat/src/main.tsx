import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Provider } from 'react-redux';
import { store } from './store';
import webSocketService from './services/websocket'; // Import the service

// Initialize the WebSocket service with the store's methods
webSocketService.setStore(store.dispatch, store.getState);

import { Provider } from 'react-redux';
import { store } from './store';
import ErrorBoundary from './components/UI/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Provider>
  </React.StrictMode>,
);