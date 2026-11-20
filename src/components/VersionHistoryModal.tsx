import React, { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { SnippetTemplate, TemplateVersion } from '../types/workspace';
import { getSnippetPreview, markdownToHtml } from '../utils/templateEngine';

interface VersionHistoryModalProps {
  template: SnippetTemplate;
  onClose: () => void;
  onRestoreVersion: (version: TemplateVersion) => void;
}

function formatSavedTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Saved earlier';

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 15) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  template,
  onClose,
  onRestoreVersion,
}) => {
  const versions = template.history ?? [];
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    versions[0]?.id ?? null
  );
  const [previewMode, setPreviewMode] = useState<'formatted' | 'markdown'>(
    'formatted'
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) || versions[0] || null;

  const renderedHtml = useMemo(
    () =>
      selectedVersion
        ? markdownToHtml(selectedVersion.content, { highlightVariables: true })
        : '',
    [selectedVersion]
  );

  const charDelta = selectedVersion
    ? selectedVersion.content.length - template.content.length
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl h-[80vh] max-h-[620px] flex flex-col rounded-lg bg-white dark:bg-[#202023] border border-slate-200 dark:border-[#34343A] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E32] flex items-center justify-between gap-4 bg-[#F8FAFC] dark:bg-[#1B1B1E]">
          <div className="flex items-center gap-2.5 min-w-0">
            <History className="w-4 h-4 text-[#0067C0] dark:text-[#4CC2FF] shrink-0" />
            <div className="min-w-0">
              <h2
                id="version-history-title"
                className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                Version History — {template.title || 'Untitled Template'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically stores the last 3 previous versions when template content is edited.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {versions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-[#28282C] flex items-center justify-center text-slate-400 mb-3">
              <History className="w-5 h-5" />
            </div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              No previous versions yet
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Whenever you edit this template&apos;s content, Notely automatically saves the previous content here (up to the last 3 versions) so you can restore anytime.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-[#2E2E32]">
            {/* Left List: Up to 3 Saved Versions */}
            <div className="w-full md:w-72 shrink-0 overflow-y-auto p-2.5 space-y-1.5 bg-[#F8FAFC]/60 dark:bg-[#1B1B1E]/60">
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                Saved Versions ({versions.length}/3)
              </div>
              {versions.map((ver, index) => {
                const isSelected = selectedVersion?.id === ver.id;
                return (
                  <button
                    key={ver.id}
                    type="button"
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-white dark:bg-[#26262A] border-[#0067C0]/50 dark:border-[#4CC2FF]/50 shadow-xs'
                        : 'border-transparent hover:bg-slate-200/50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isSelected
                            ? 'text-[#0067C0] dark:text-[#4CC2FF]'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {index === 0 ? 'Previous Version' : `Version -${index + 1}`}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                        {formatSavedTimestamp(ver.savedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {getSnippetPreview(ver.content, 90) || '(Empty content)'}
                    </p>
                    <div className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                      {ver.content.length} chars
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Pane: Selected Version Preview */}
            <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-[#202023]">
              <div className="px-5 py-2.5 border-b border-slate-200/80 dark:border-[#2E2E32] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Saved{' '}
                    {selectedVersion
                      ? new Date(selectedVersion.savedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : ''}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {charDelta === 0
                      ? 'Same length as current'
                      : charDelta > 0
                      ? `+${charDelta} chars vs current`
                      : `${charDelta} chars vs current`}
                  </span>
                </div>

                <div className="flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-[#2A2A2F]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('formatted')}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      previewMode === 'formatted'
                        ? 'bg-white dark:bg-[#38383F] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Formatted
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('markdown')}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      previewMode === 'markdown'
                        ? 'bg-white dark:bg-[#38383F] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Raw MD
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {selectedVersion ? (
                  previewMode === 'formatted' ? (
                    <div
                      className="template-prose text-slate-800 dark:text-slate-200"
                      dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300 bg-[#F8FAFC] dark:bg-[#18181B] border border-slate-200 dark:border-[#2E2E32] rounded-md p-4">
                      {selectedVersion.content}
                    </pre>
                  )
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#2E2E32] bg-[#F8FAFC] dark:bg-[#1B1B1E] flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Restoring saves your current content into history too, so nothing is lost.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
            >
              Close
            </button>
            {selectedVersion && (
              <button
                type="button"
                onClick={() => {
                  onRestoreVersion(selectedVersion);
                  onClose();
                }}
                className="flex items-center gap-1.5 h-8 px-4 rounded-md bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#4CC2FF] dark:hover:bg-[#38B6F8] text-white dark:text-[#0F172A] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore This Version</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
