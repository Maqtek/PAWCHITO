import '@fontsource-variable/nunito';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { mocksEnabled } from './mocks/enabled';

async function enableMocks() {
  // Прямая проверка DEV вырезает чанк моков из продакшен-сборки.
  if (!import.meta.env.DEV) return;
  if (!mocksEnabled) return;
  const { worker, onUnhandledFrame, pawchitoMocks } = await import('./mocks/browser');
  Object.assign(window, { pawchitoMocks });
  // Предупреждение только о запросах к /api/ без мока, а не о навигации и ассетах.
  await worker.start({ onUnhandledFrame });
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
