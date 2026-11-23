/**
 * Client-side Zero-Knowledge End-to-End Encryption (AES-256-GCM + PBKDF2-SHA256)
 * Uses only the native Web Crypto API (`crypto.subtle`) so passphrases and keys
 * never leave memory and never touch Firestore or localStorage.
 */

export const E2EE_PREFIX = 'enc:v1:';
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFIER_SENTINEL = 'notely-e2ee-v1-verified';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function isWebCryptoAvailable(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.crypto &&
      window.crypto.subtle &&
      typeof window.crypto.getRandomValues === 'function'
  );
}

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(E2EE_PREFIX);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveAesKey(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Copy into a clean ArrayBuffer-backed Uint8Array for strict TypeScript BufferSource compatibility
  const cleanSalt = new Uint8Array(saltBytes.byteLength);
  cleanSalt.set(saltBytes);

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: cleanSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptString(plaintext: string, key: CryptoKey): Promise<string> {
  if (!plaintext) return '';
  const iv = new Uint8Array(IV_BYTES);
  window.crypto.getRandomValues(iv);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plaintext)
  );

  return `${E2EE_PREFIX}${bytesToBase64Url(iv)}:${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptString(value: string, key: CryptoKey | null): Promise<string> {
  if (!value || !isEncryptedValue(value)) {
    return value;
  }
  if (!key) {
    throw new Error('Encrypted vault is locked.');
  }

  const rest = value.slice(E2EE_PREFIX.length);
  const sepIdx = rest.indexOf(':');
  if (sepIdx <= 0) {
    throw new Error('Malformed encrypted payload.');
  }

  const ivRaw = base64UrlToBytes(rest.slice(0, sepIdx));
  const cipherRaw = base64UrlToBytes(rest.slice(sepIdx + 1));

  const iv = new Uint8Array(ivRaw.byteLength);
  iv.set(ivRaw);
  const cipherBytes = new Uint8Array(cipherRaw.byteLength);
  cipherBytes.set(cipherRaw);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );

  return textDecoder.decode(decrypted);
}

export interface VaultKeySetup {
  key: CryptoKey;
  salt: string;
  verifier: string;
}

/**
 * Generates a fresh random PBKDF2 salt, derives a non-extractable AES-256-GCM key,
 * and encrypts a fixed sentinel verifier so future devices can verify the passphrase
 * locally without ever storing the passphrase or key in Firestore.
 */
export async function createVaultConfig(passphrase: string): Promise<VaultKeySetup> {
  const saltBytes = new Uint8Array(SALT_BYTES);
  window.crypto.getRandomValues(saltBytes);
  const salt = bytesToBase64Url(saltBytes);
  const key = await deriveAesKey(passphrase, saltBytes);
  const verifier = await encryptString(VERIFIER_SENTINEL, key);
  return { key, salt, verifier };
}

/**
 * Derives an AES-256-GCM key from the user's passphrase + stored salt and validates it
 * against the encrypted sentinel. Returns null if the passphrase is incorrect.
 */
export async function unlockVaultKey(
  passphrase: string,
  salt: string,
  verifier: string
): Promise<CryptoKey | null> {
  if (!passphrase || !salt || !verifier) return null;
  try {
    const saltBytes = base64UrlToBytes(salt);
    const key = await deriveAesKey(passphrase, saltBytes);
    const decoded = await decryptString(verifier, key);
    return decoded === VERIFIER_SENTINEL ? key : null;
  } catch {
    return null;
  }
}
