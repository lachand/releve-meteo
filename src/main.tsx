import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureStorageHeadroom } from './pwa/storage';
import { App } from './ui/views/App';
import './ui/styles/tokens.css';
import './ui/styles/base.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Element racine #root introuvable.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void ensureStorageHeadroom(Date.now());
