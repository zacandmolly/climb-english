import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installErrorReporter } from './lib/errorReporter';
import './styles.css';

// Collect frontend errors for the R10 report loop (collect+report; no auto-fix).
installErrorReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
