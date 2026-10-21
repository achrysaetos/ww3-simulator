import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SimClient } from './client';
import './styles.css';

const client = new SimClient();
(window as unknown as { __client?: SimClient }).__client = client;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
