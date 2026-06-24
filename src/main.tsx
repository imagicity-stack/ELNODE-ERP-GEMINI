import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './lib/pdfSetup';
import App from './App.tsx';
import './index.css';

// Register service worker for PWA functionality - disabled to troubleshoot reload loop
// registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
