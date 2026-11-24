import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { DesktopAuthBridge } from './components/DesktopAuthBridge';
import { DesktopWebAuthPage } from './components/DesktopWebAuthPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const searchParams =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;

const isDesktopAuthBridge =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/__notely_auth_bridge__' ||
    searchParams?.get('notely_auth_bridge') === '1');

const isDesktopWebAuthRelay = searchParams?.get('desktop_auth') === '1';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {isDesktopAuthBridge ? (
      <DesktopAuthBridge />
    ) : isDesktopWebAuthRelay ? (
      <DesktopWebAuthPage />
    ) : (
      <App />
    )}
  </ErrorBoundary>
);
