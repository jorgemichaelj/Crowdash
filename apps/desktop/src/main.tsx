import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { BackendProvider } from './services/backend/BackendProvider';
import { ToastProvider } from './components/ui/toast';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <BackendProvider>
        <App />
      </BackendProvider>
    </ToastProvider>
  </React.StrictMode>
);
