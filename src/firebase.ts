import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DEFAULT_DESKTOP_WEB_AUTH_URL =
  'https://ais-pre-hk54y74c2flsdo7nhoqcri-470217181044.asia-east1.run.app';

export function getDesktopWebAuthUrl(): string {
  const envUrl =
    typeof import.meta.env?.VITE_DESKTOP_AUTH_WEB_URL === 'string'
      ? import.meta.env.VITE_DESKTOP_AUTH_WEB_URL.trim()
      : '';
  return envUrl || DEFAULT_DESKTOP_WEB_AUTH_URL;
}

export async function signInWithGoogle(options?: {
  mode?: 'browser' | 'window';
}) {
  if (
    typeof window !== 'undefined' &&
    window.fluentDesktop?.isElectron &&
    window.fluentDesktop?.signInWithGoogle
  ) {
    const bridgeResult = await window.fluentDesktop.signInWithGoogle({
      authDomain: firebaseConfig.authDomain,
      mode: options?.mode || 'browser',
      webAuthUrl: getDesktopWebAuthUrl(),
    });
    if (!bridgeResult.ok) {
      const error = new Error(
        bridgeResult.message || 'Google Sign-In did not complete.'
      ) as Error & { code?: string };
      error.code = bridgeResult.code || 'auth/popup-closed-by-user';
      throw error;
    }

    const credential = GoogleAuthProvider.credential(
      bridgeResult.idToken ?? null,
      bridgeResult.accessToken ?? null
    );
    return signInWithCredential(auth, credential);
  }

  return signInWithPopup(auth, googleProvider);
}

export async function cancelDesktopGoogleSignIn() {
  if (
    typeof window !== 'undefined' &&
    window.fluentDesktop?.isElectron &&
    window.fluentDesktop?.cancelGoogleSignIn
  ) {
    await window.fluentDesktop.cancelGoogleSignIn();
  }
}

export async function signOutAccount() {
  return firebaseSignOut(auth);
}

const isStandaloneAuthWindow =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/__notely_auth_bridge__' ||
    new URLSearchParams(window.location.search).get('notely_auth_bridge') === '1' ||
    new URLSearchParams(window.location.search).get('desktop_auth') === '1');

async function testConnection() {
  if (isStandaloneAuthWindow) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
