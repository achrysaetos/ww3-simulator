import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SimClient } from './client';
import './styles.css';

const client = new SimClient(new URLSearchParams(location.search).get('scenario') ?? 'demo');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
