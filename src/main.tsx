import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection event:', event);
  console.error('Reason Object:', event.reason);
  if (event.reason) {
    console.error('Reason String:', String(event.reason));
    if (event.reason.message) console.error('Reason Message:', event.reason.message);
    if (event.reason.stack) {
      console.error('Stack trace:', event.reason.stack);
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
