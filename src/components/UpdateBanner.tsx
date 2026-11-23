import { ArrowDownToLine, RefreshCw, RotateCw, X } from 'lucide-react';
import { AppUpdateState } from '../types/electron';

interface UpdateBannerProps {
  updateState: AppUpdateState;
  hasActiveToasts: boolean;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  updateState,
  hasActiveToasts,
  onDownload,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  const { status, availableVersion, progressPercent } = updateState;
  const isVisible =
    status === 'available' || status === 'downloading' || status === 'downloaded';

  if (!isVisible) return null;

  const versionLabel = availableVersion ? `v${availableVersion}` : 'new version';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 z-40 w-[332px] max-w-[calc(100vw-32px)] rounded-lg bg-[var(--surface-elevated)] border border-[var(--surface-border)] shadow-xl p-3.5 transition-all ${
        hasActiveToasts ? 'bottom-[78px]' : 'bottom-4'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
          {status === 'downloaded' ? (
            <RotateCw className="w-3.5 h-3.5" />
          ) : status === 'downloading' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ArrowDownToLine className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {status === 'available' && (
                <>
                  Update{' '}
                  <span className="font-mono tabular-nums">{versionLabel}</span>{' '}
                  available
                </>
              )}
              {status === 'downloading' && (
                <>
                  Downloading{' '}
                  <span className="font-mono tabular-nums">{versionLabel}</span>
                </>
              )}
              {status === 'downloaded' && (
                <>
                  Update{' '}
                  <span className="font-mono tabular-nums">{versionLabel}</span>{' '}
                  ready
                </>
              )}
            </p>

            {status !== 'downloading' && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss update banner"
                title="Later"
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-[var(--surface-hover)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {status === 'available' &&
              'Download directly inside Notely — your templates and settings stay intact.'}
            {status === 'downloading' &&
              'Fetching release package from GitHub Releases...'}
            {status === 'downloaded' &&
              'Restart Notely to finish installing the update automatically.'}
          </p>

          {status === 'downloading' && (
            <div className="mt-2.5 space-y-1">
              <div className="h-1.5 w-full rounded-full bg-[var(--surface-frame)] overflow-hidden border border-[var(--surface-border)]">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-200"
                  style={{ width: `${Math.max(4, progressPercent)}%` }}
                />
              </div>
              <div className="flex justify-end">
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {progressPercent}%
                </span>
              </div>
            </div>
          )}

          {status === 'available' && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={onDownload}
                className="h-7 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <ArrowDownToLine className="w-3 h-3" />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] transition-colors"
              >
                Later
              </button>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={onInstall}
                className="h-7 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <RotateCw className="w-3 h-3" />
                <span>Restart &amp; Install</span>
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] transition-colors"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
