import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App.tsx';
import './index.css';
import ErrorBoundary from './components/UI/ErrorBoundary';
import webSocketService from './services/websocket';

// Initialize the WebSocket service with the store's methods
webSocketService.setStore(store.dispatch, store.getState);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Provider>
  </React.StrictMode>
);
