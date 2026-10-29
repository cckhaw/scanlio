import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ToastProvider } from './components/Toast';
import './index.css';
import { ScanProvider } from './state/ScanSession';
import { ThemeProvider } from './theme/ThemeContext';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ScanProvider>
          <App />
        </ScanProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>
);
