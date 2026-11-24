import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { DesktopAuthBridge } from './components/DesktopAuthBridge';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const isDesktopAuthBridge =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/__notely_auth_bridge__' ||
    new URLSearchParams(window.location.search).get('notely_auth_bridge') === '1');

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {isDesktopAuthBridge ? <DesktopAuthBridge /> : <App />}
  </ErrorBoundary>
);
