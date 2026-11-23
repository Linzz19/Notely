import { AlertCircle, Eye, EyeOff, KeyRound, Lock, ShieldCheck, Unlock, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

export type VaultModalMode = 'setup' | 'unlock' | 'disable';

interface VaultModalProps {
  mode: VaultModalMode;
  busy: boolean;
  error: string | null;
  onSubmitPassphrase: (passphrase: string) => void;
  onDisableEncryption: () => void;
  onClose: () => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({
  mode,
  busy,
  error,
  onSubmitPassphrase,
  onDisableEncryption,
  onClose,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPassphrase('');
    setConfirmPassphrase('');
    setLocalError(null);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [mode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === 'disable') {
      onDisableEncryption();
      return;
    }

    if (mode === 'setup') {
      if (passphrase.length < 8) {
        setLocalError('Passphrase must be at least 8 characters long.');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setLocalError('Passphrases do not match.');
        return;
      }
    } else if (!passphrase) {
      setLocalError('Enter your Sync Passphrase to unlock cloud templates.');
      return;
    }

    onSubmitPassphrase(passphrase);
  };

  const displayError = localError || error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vault-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        <div className="px-5 py-3.5 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {mode === 'unlock' ? (
              <KeyRound className="w-4 h-4 text-[var(--accent)]" />
            ) : mode === 'setup' ? (
              <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
            ) : (
              <Unlock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
            <h2
              id="vault-modal-title"
              className="text-sm font-semibold font-display"
            >
              {mode === 'setup'
                ? 'Enable End-to-End Cloud Encryption'
                : mode === 'unlock'
                  ? 'Unlock Encrypted Cloud Sync'
                  : 'Turn Off Cloud Encryption'}
            </h2>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {mode === 'setup' && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Your tab names, categories, template titles, body text, and tags will be encrypted on your device using{' '}
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                AES-256-GCM
              </strong>{' '}
              before syncing to Firebase. Your passphrase is never sent to the cloud.
            </p>
          )}

          {mode === 'unlock' && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This cloud workspace is protected with end-to-end encryption. Enter your Sync Passphrase to decrypt and resume real-time sync on this device.
            </p>
          )}

          {mode === 'disable' && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Turning off end-to-end encryption will re-sync your workspace in standard private account mode (protected by Google Sign-In and per-user Firebase rules, without requiring a passphrase on new devices).
            </p>
          )}

          {mode !== 'disable' && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="vault-passphrase"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1"
                >
                  Sync Passphrase
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="vault-passphrase"
                    type={showPassphrase ? 'text' : 'password'}
                    autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={
                      mode === 'setup'
                        ? 'At least 8 characters'
                        : 'Enter your Sync Passphrase'
                    }
                    className="w-full h-9 pl-3 pr-9 rounded-md bg-[var(--surface-input)] border border-[var(--surface-border)] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase((v) => !v)}
                    aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassphrase ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {mode === 'setup' && (
                <div>
                  <label
                    htmlFor="vault-passphrase-confirm"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1"
                  >
                    Confirm Passphrase
                  </label>
                  <input
                    id="vault-passphrase-confirm"
                    type={showPassphrase ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Re-enter passphrase"
                    className="w-full h-9 px-3 rounded-md bg-[var(--surface-input)] border border-[var(--surface-border)] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                </div>
              )}

              {mode === 'setup' && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                  Save this passphrase somewhere safe (like a password manager). Because encryption is zero-knowledge, a forgotten passphrase cannot be recovered.
                </div>
              )}
            </div>
          )}

          {displayError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-8 px-3 rounded-md border border-[var(--surface-border)] hover:bg-[var(--surface-hover)] text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-8 px-3.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {busy
                  ? 'Working...'
                  : mode === 'setup'
                    ? 'Encrypt & Sync'
                    : mode === 'unlock'
                      ? 'Unlock Vault'
                      : 'Turn Off Encryption'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
