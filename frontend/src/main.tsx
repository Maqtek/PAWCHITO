import '@fontsource-variable/nunito';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { mocksEnabled } from './mocks/enabled';

async function enableMocks() {
  if (!mocksEnabled) return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledFrame: 'warn' });
}

enableMocks()
  .catch((error: unknown) => {
    console.error('Не удалось запустить моки MSW', error);
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
