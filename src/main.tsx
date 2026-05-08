import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error || event.message);
});

// Enhanced Global Rejection Logging
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  console.group('--- UNHANDLED PROMISE REJECTION ---');
  console.error('Reason:', reason);
  
  if (reason instanceof Error) {
    console.error('Name:', reason.name);
    console.error('Message:', reason.message);
    console.groupCollapsed('Stack Trace');
    console.error(reason.stack);
    console.groupEnd();
  } else if (reason && typeof reason === 'object') {
    try {
      console.error('Reason (JSON):', JSON.stringify(reason, null, 2));
    } catch (e) {
      console.error('Reason (Object):', reason);
    }
  } else {
    console.error('Reason (Literal):', String(reason));
  }
  console.groupEnd();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
