import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

type RelayStatus =
  | 'ready'
  | 'authenticating'
  | 'sending'
  | 'success'
  | 'error'
  | 'invalid';

interface RelayParams {
  port: number;
  state: string;
}

const STATE_HEX_REGEX = /^[a-f0-9]{32,128}$/i;

function parseRelayParams(): RelayParams | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const rawPort = params.get('callback_port') || '';
  const rawState = params.get('state') || '';

  if (!/^\d{4,5}$/.test(rawPort)) return null;
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  if (!STATE_HEX_REGEX.test(rawState)) return null;

  return { port, state: rawState };
}

export const DesktopWebAuthPage: React.FC = () => {
  const relayParams = useMemo(() => parseRelayParams(), []);
  const [status, setStatus] = useState<RelayStatus>(
    relayParams ? 'ready' : 'invalid'
  );
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoReturnTriggeredRef = useRef(false);

  // Scrub one-time state & callback_port from the browser address bar and history
  useEffect(() => {
    try {
      const cleanUrl = `${window.location.pathname}?desktop_auth=1`;
      window.history.replaceState(null, '', cleanUrl);
    } catch {
      // Ignore history API errors in restricted contexts
    }
  }, []);

  // Respect system light/dark preference on the standalone browser relay page
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      document.documentElement.classList.toggle('dark', media.matches);
    };
    syncTheme();
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, []);

  const triggerReturnToDesktop = () => {
    window.location.href = 'notely://auth-return';
  };

  const handleContinueWithGoogle = async () => {
    if (!relayParams) {
      setStatus('invalid');
      return;
    }

    setErrorMessage(null);
    setStatus('authenticating');

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (!credential || (!credential.idToken && !credential.accessToken)) {
        setStatus('error');
        setErrorMessage(
          'Google Sign-In did not return a valid OAuth credential. Please try again.'
        );
        return;
      }

      setAccountEmail(result.user.email || null);
      setAccountName(result.user.displayName || null);
      setStatus('sending');

      const callbackEndpoint = `http://127.0.0.1:${relayParams.port}/auth/callback`;
      const response = await fetch(callbackEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: relayParams.state,
          idToken: credential.idToken ?? null,
          accessToken: credential.accessToken ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error('CALLBACK_REJECTED');
      }

      setStatus('success');

      if (!autoReturnTriggeredRef.current) {
        autoReturnTriggeredRef.current = true;
        // Complement Electron's automatic window focus with protocol wake-up
        window.setTimeout(() => {
          triggerReturnToDesktop();
        }, 250);
      }
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';

      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setStatus('ready');
        return;
      }

      setStatus('error');
      if (err instanceof Error && err.message === 'CALLBACK_REJECTED') {
        setErrorMessage(
          'Notely Desktop rejected or expired this sign-in session. Return to Notely and start sign-in again.'
        );
      } else if (err instanceof TypeError) {
        setErrorMessage(
          'Could not reach Notely Desktop on this device. Make sure Notely is still open and retry from the app.'
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMessage(
          'Your browser blocked the Google Sign-In popup. Allow popups for this page and click Continue with Google again.'
        );
      } else if (code === 'auth/network-request-failed') {
        setErrorMessage('Check your internet connection and try again.');
      } else {
        setErrorMessage(
          'Sign-in did not complete. Please click Continue with Google to try again.'
        );
      }
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[var(--surface-frame)] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center font-display font-bold text-sm shrink-0">
            N
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-sm font-semibold truncate">
              Sign in to Notely Desktop
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Browser Google account handoff
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {status === 'invalid' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg p-3 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  This desktop sign-in link is missing or expired. Please start
                  Google Sign-In again from the Notely desktop app.
                </span>
              </div>
            </div>
          )}

          {(status === 'ready' ||
            status === 'authenticating' ||
            status === 'sending') && (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Continue with your logged-in Google account in this browser to
                connect Cloud Sync on your Notely desktop app.
              </p>

              <button
                type="button"
                disabled={status !== 'ready'}
                onClick={() => void handleContinueWithGoogle()}
                className="w-full h-10 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-65 cursor-pointer"
              >
                {status === 'ready' ? (
                  <>
                    <LogIn className="w-4 h-4 shrink-0" />
                    <span>Continue with Google</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>
                      {status === 'sending'
                        ? 'Returning to Notely Desktop...'
                        : 'Waiting for Google...'}
                    </span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Your sign-in is sent directly to Notely on this computer over
                localhost with a single-use security token.
              </p>
            </>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-900/60">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    Signed in to Notely Desktop
                  </p>
                  {(accountName || accountEmail) && (
                    <p className="text-[11.5px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                      {accountName ? `${accountName} · ` : ''}
                      {accountEmail}
                    </p>
                  )}
                </div>
              </div>

              <a
                href="notely://auth-return"
                className="w-full h-10 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span>Return to Notely</span>
              </a>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-snug">
                Notely should come back to the front automatically. You can
                safely close this browser tab.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg p-3 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage || 'Google Sign-In failed.'}</span>
              </div>

              <button
                type="button"
                onClick={() => void handleContinueWithGoogle()}
                className="w-full h-9 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Try Again with Google</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
