import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { CopyFormat, SnippetTemplate } from '../types/workspace';
import {
  extractVariables,
  markdownToHtml,
  substituteVariables,
} from '../utils/templateEngine';

interface QuickFillModalProps {
  template: SnippetTemplate;
  requestedFormat: CopyFormat;
  onClose: () => void;
  onConfirmCopy: (filledContent: string, format: CopyFormat) => void;
}

export const QuickFillModal: React.FC<QuickFillModalProps> = ({
  template,
  requestedFormat,
  onClose,
  onConfirmCopy,
}) => {
  const variables = useMemo(
    () => extractVariables(template.content),
    [template.content]
  );

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of variables) {
      initial[v.name] = v.defaultValue || '';
    }
    return initial;
  });

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

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

  const substitutedContent = useMemo(
    () => substituteVariables(template.content, values, true),
    [template.content, values]
  );

  const previewHtml = useMemo(
    () => markdownToHtml(substitutedContent, { highlightVariables: true }),
    [substitutedContent]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmCopy(substitutedContent, requestedFormat);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-fill-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-lg bg-white dark:bg-[#202023] border border-slate-200 dark:border-[#34343A] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E32] flex items-center justify-between gap-4 bg-[#F8FAFC] dark:bg-[#1B1B1E]">
          <div className="min-w-0">
            <h2
              id="quick-fill-title"
              className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Quick-Fill Variables — {template.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fill dynamic fields below and press Enter to copy with formatting preserved.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick-fill dialog"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left Inputs + Right Live Preview */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-[#2E2E32]"
        >
          {/* Variable Inputs */}
          <div className="w-full md:w-[300px] shrink-0 p-4 overflow-y-auto space-y-3 bg-[#F8FAFC]/50 dark:bg-[#1B1B1E]/40">
            {variables.map((v, idx) => (
              <div key={v.name} className="space-y-1">
                <label
                  htmlFor={`var-input-${v.name}`}
                  className="block font-mono text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {v.name}
                  {v.defaultValue && (
                    <span className="ml-1.5 font-sans text-[11px] font-normal text-slate-400">
                      (default: {v.defaultValue})
                    </span>
                  )}
                </label>
                <input
                  id={`var-input-${v.name}`}
                  ref={idx === 0 ? firstInputRef : undefined}
                  type="text"
                  value={values[v.name] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                  }
                  placeholder={v.defaultValue || `Enter ${v.name}...`}
                  className="w-full h-9 px-3 text-[13px] bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#34343A] rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0067C0] dark:focus:border-[#4CC2FF]"
                />
              </div>
            ))}
          </div>

          {/* Live Preview */}
          <div className="flex-1 min-w-0 p-5 overflow-y-auto bg-white dark:bg-[#202023]">
            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-3">
              Live Output Preview
            </div>
            <div
              className="template-prose text-slate-800 dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#2E2E32] bg-[#F8FAFC] dark:bg-[#1B1B1E] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onConfirmCopy(template.content, requestedFormat)}
            className="h-8 px-3 rounded-md border border-slate-200 dark:border-[#34343A] bg-white dark:bg-[#242428] text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            Copy Raw {'{{vars}}'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirmCopy(substitutedContent, 'plain')}
              className="h-8 px-3 rounded-md border border-slate-200 dark:border-[#34343A] bg-white dark:bg-[#242428] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              Copy Plain Text
            </button>
            <button
              type="button"
              onClick={() => onConfirmCopy(substitutedContent, 'rich')}
              className="flex items-center gap-1.5 h-8 px-4 rounded-md bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#4CC2FF] dark:hover:bg-[#38B6F8] text-white dark:text-[#0F172A] text-xs font-semibold transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Formatted</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
