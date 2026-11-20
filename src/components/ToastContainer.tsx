import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastMessage } from '../types/workspace';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-md bg-white dark:bg-[#26262A] border border-slate-200 dark:border-[#38383F] shadow-lg text-xs"
        >
          {toast.variant === 'success' && (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          )}
          {toast.variant === 'info' && (
            <Info className="w-4 h-4 text-[#0067C0] dark:text-[#4CC2FF] shrink-0 mt-0.5" />
          )}
          {(toast.variant === 'warning' || toast.variant === 'error') && (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {toast.message}
            </p>
            {toast.detail && (
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {toast.detail}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
