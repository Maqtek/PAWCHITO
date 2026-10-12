import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import './styles/index.css';
import App from './App';

async function startApp() {
  if (import.meta.env.DEV) {
    try {
      const { worker } = await import('./mocks/browser');
      await worker.start({
        serviceWorker: { url: '/mockServiceWorker.js' },
        onUnhandledFrame: 'warn',
      });
    } catch (error) {
      console.error('Не удалось запустить MSW. Проверьте поддержку Service Worker.', error);
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode><App /></StrictMode>,
  );
}

void startApp();
