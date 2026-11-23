import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Notely ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center p-6 bg-[var(--surface-frame)] text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full rounded-xl bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-base font-semibold">
                  Something went wrong
                </h1>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Your local workspace data is safe. Reload Notely to continue.
                </p>
              </div>
            </div>

            {this.state.message && (
              <pre className="p-2.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--surface-border)] text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-28">
                {this.state.message}
              </pre>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-8 px-3.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reload Notely</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
