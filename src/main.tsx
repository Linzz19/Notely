import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { DesktopWebAuthPage } from './components/DesktopWebAuthPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const searchParams =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;

const isDesktopWebAuthRelay = searchParams?.get('desktop_auth') === '1';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {isDesktopWebAuthRelay ? <DesktopWebAuthPage /> : <App />}
  </ErrorBoundary>
);
