import { Cloud, GitMerge, HardDrive, X } from 'lucide-react';

interface CloudSyncModalProps {
  userEmail: string | null;
  localTemplateCount: number;
  cloudTemplateCount: number;
  onMerge: () => void;
  onUseCloud: () => void;
  onUseLocal: () => void;
  onCancel: () => void;
}

export function CloudSyncModal({
  userEmail,
  localTemplateCount,
  cloudTemplateCount,
  onMerge,
  onUseCloud,
  onUseLocal,
  onCancel,
}: CloudSyncModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-sync-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-xl bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        <div className="px-4 py-3 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <h2
              id="cloud-sync-modal-title"
              className="font-display text-sm font-semibold truncate"
            >
              Sync Local &amp; Cloud Workspace
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel sync choice"
            className="p-1 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-[var(--surface-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Found an existing cloud workspace for{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {userEmail || 'your Google account'}
            </strong>{' '}
            (<span className="font-mono tabular-nums">{cloudTemplateCount}</span>{' '}
            templates) alongside custom local templates on this device (
            <span className="font-mono tabular-nums">{localTemplateCount}</span>{' '}
            templates). Choose how to sync:
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onMerge}
              className="w-full p-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft-strong)] text-left flex items-start gap-2.5 transition-colors"
            >
              <GitMerge className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Merge Both (Recommended)
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                  Keep all cloud templates and add your unique local templates into your synced account.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onUseCloud}
              className="w-full p-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-left flex items-start gap-2.5 transition-colors"
            >
              <Cloud className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Use Cloud Workspace
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Replace this device&apos;s local data with your saved cloud workspace.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onUseLocal}
              className="w-full p-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-left flex items-start gap-2.5 transition-colors"
            >
              <HardDrive className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Keep Local &amp; Replace Cloud
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Overwrite your cloud workspace with the templates currently on this device.
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
