import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  RefreshCw,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

export type CloudSyncStatus =
  | 'signed-out'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

interface AccountMenuProps {
  user: User | null;
  authLoading: boolean;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onSyncNow: () => void;
}

function getInitials(user: User): string {
  const source = user.displayName || user.email || 'U';
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function AccountMenu({
  user,
  authLoading,
  syncStatus,
  lastSyncedAt,
  syncError,
  onSignIn,
  onSignOut,
  onSyncNow,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgFailed(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-account-menu-trigger="true"]')) return;
      setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const formattedLastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="relative">
      {user ? (
        <button
          type="button"
          data-account-menu-trigger="true"
          onClick={() => setIsOpen((v) => !v)}
          aria-label="Account and cloud sync"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title={`${user.displayName || user.email} — Cloud Sync`}
          className={`app-no-drag relative flex items-center justify-center w-8 h-8 rounded-md transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            isOpen
              ? 'bg-[var(--accent-soft)]'
              : 'hover:bg-[var(--surface-hover)]'
          }`}
        >
          {user.photoURL && !imgFailed ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Account avatar'}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-6 h-6 rounded-full object-cover border border-[var(--surface-border)]"
            />
          ) : (
            <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] text-[10px] font-bold flex items-center justify-center">
              {getInitials(user)}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          data-account-menu-trigger="true"
          disabled={authLoading}
          onClick={() => setIsOpen((v) => !v)}
          aria-label="Sign in with Google for Cloud Sync"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title="Sign in with Google to auto-sync templates & settings"
          className={`app-no-drag flex items-center gap-1.5 h-8 px-2 xl:px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            isOpen
              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]'
              : 'bg-[var(--surface-panel)] border-[var(--surface-border)] text-slate-700 dark:text-slate-200 hover:border-[var(--surface-border-strong)] hover:text-slate-950 dark:hover:text-white'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span className="hidden lg:inline">Sign In</span>
        </button>
      )}

      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Account and cloud sync"
          className="app-no-drag absolute right-0 top-full mt-2 z-50 w-[300px] max-w-[calc(100vw-24px)] rounded-xl bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-xl overflow-hidden text-slate-900 dark:text-slate-100"
        >
          <div className="px-3.5 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-[var(--accent)]" />
              <h2 className="text-[13px] font-semibold font-display">
                Cloud Sync
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Close (Esc)"
              className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[var(--surface-hover)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {user ? (
            <div className="p-3.5 space-y-3">
              {/* Signed-in Google Profile */}
              <div className="flex items-center gap-2.5">
                {user.photoURL && !imgFailed ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Account avatar'}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-9 h-9 rounded-full object-cover border border-[var(--surface-border)] shrink-0"
                  />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold flex items-center justify-center shrink-0">
                    {getInitials(user)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user.displayName || 'Google Account'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {user.email}
                  </p>
                </div>
              </div>

              {/* Sync State Box */}
              <div className="p-2.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--surface-border)] space-y-2">
                <div className="flex items-start gap-2 text-[11.5px] leading-snug">
                  {syncStatus === 'syncing' && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)] animate-spin shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-200">
                        Syncing workspace with Firebase...
                      </span>
                    </>
                  )}
                  {syncStatus === 'synced' && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-200">
                        Synced to cloud
                        {formattedLastSync ? (
                          <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {' '}
                            · {formattedLastSync}
                          </span>
                        ) : null}
                      </span>
                    </>
                  )}
                  {syncStatus === 'offline' && (
                    <>
                      <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-200">
                        Offline — changes saved locally and will sync when back online.
                      </span>
                    </>
                  )}
                  {syncStatus === 'error' && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <span className="text-red-700 dark:text-red-300">
                        {syncError || 'Sync paused due to an error.'}
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={syncStatus === 'syncing'}
                  onClick={onSyncNow}
                  className="w-full h-7 px-2.5 rounded-md border border-[var(--surface-border)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] text-[11.5px] font-medium text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${
                      syncStatus === 'syncing' ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Sync Now</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Tabs, categories, templates, and theme appearance auto-sync across your signed-in devices.
              </p>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSignOut();
                }}
                className="w-full h-8 px-3 rounded-md border border-[var(--surface-border)] hover:bg-[var(--surface-hover)] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Sign in with your Google account to automatically sync all tabs, categories, templates, and theme settings across your devices.
              </p>

              <button
                type="button"
                disabled={authLoading}
                onClick={() => {
                  setIsOpen(false);
                  onSignIn();
                }}
                className="w-full h-9 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Continue with Google</span>
              </button>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Your data is stored privately under your account in Firebase and still stays cached locally for offline use.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
