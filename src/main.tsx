import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('Root-Element #root wurde nicht gefunden (index.html).');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>
);
