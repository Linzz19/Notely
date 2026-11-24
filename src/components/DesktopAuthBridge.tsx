import React, { useEffect, useState } from 'react';
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithRedirect,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const BRIDGE_STARTED_KEY = 'notely_desktop_auth_started';

export const DesktopAuthBridge: React.FC = () => {
  const [statusText, setStatusText] = useState('Connecting to Google Sign-In...');

  useEffect(() => {
    let active = true;

    const runBridge = async () => {
      const bridge = window.notelyAuthBridge;
      if (!bridge) {
        if (active) {
          setStatusText('Desktop sign-in bridge is unavailable.');
        }
        return;
      }

      try {
        const result = await getRedirectResult(auth);
        if (!active) return;

        if (result) {
          sessionStorage.removeItem(BRIDGE_STARTED_KEY);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential && (credential.idToken || credential.accessToken)) {
            setStatusText('Signing you in to Notely...');
            bridge.complete({
              idToken: credential.idToken ?? null,
              accessToken: credential.accessToken ?? null,
            });
            return;
          }
          bridge.fail({
            code: 'auth/credential-already-in-use',
            message: 'Google Sign-In did not return a valid OAuth credential.',
          });
          return;
        }

        const alreadyStarted = sessionStorage.getItem(BRIDGE_STARTED_KEY) === '1';
        if (alreadyStarted) {
          sessionStorage.removeItem(BRIDGE_STARTED_KEY);
          bridge.fail({
            code: 'auth/popup-closed-by-user',
            message: 'Sign-in was canceled before completing.',
          });
          return;
        }

        sessionStorage.setItem(BRIDGE_STARTED_KEY, '1');
        setStatusText('Redirecting to Google...');
        await signInWithRedirect(auth, googleProvider);
      } catch (err) {
        if (!active) return;
        sessionStorage.removeItem(BRIDGE_STARTED_KEY);
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : 'auth/internal-error';
        const message =
          err instanceof Error ? err.message : 'Google Sign-In failed.';
        bridge.fail({ code, message });
      }
    };

    void runBridge();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#161618] text-slate-100 px-6 text-center select-none">
      <div className="w-9 h-9 rounded-full border-2 border-[#4CC2FF]/25 border-t-[#4CC2FF] animate-spin mb-4" />
      <p className="text-sm font-medium text-slate-100">{statusText}</p>
      <p className="text-xs text-slate-400 mt-1.5 max-w-xs">
        You will return to Notely automatically once sign-in finishes.
      </p>
    </div>
  );
};
