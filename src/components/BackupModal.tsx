import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FolderOpen,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { WorkspaceData } from '../types/workspace';
import {
  downloadWorkspaceBackup,
  parseBackupJson,
  ParsedBackupResult,
} from '../utils/storage';

interface BackupModalProps {
  workspace: WorkspaceData;
  onClose: () => void;
  onImportReplace: (parsed: ParsedBackupResult) => void;
  onImportMerge: (parsed: ParsedBackupResult) => void;
  onResetStarter: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  workspace,
  onClose,
  onImportReplace,
  onImportMerge,
  onResetStarter,
}) => {
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedBackupResult | null>(
    null
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [desktopDataPath, setDesktopDataPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isElectron = Boolean(window.fluentDesktop?.isElectron);

  useEffect(() => {
    if (window.fluentDesktop?.isElectron) {
      void window.fluentDesktop.getWorkspacePath().then(setDesktopDataPath);
    }
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleChooseImportFile = async () => {
    if (window.fluentDesktop?.isElectron) {
      setImportError(null);
      setParsedPreview(null);
      try {
        const res = await window.fluentDesktop.importBackupDialog();
        if (res.canceled || !res.content) return;
        setParsedPreview(parseBackupJson(res.content));
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : 'Unable to read backup file.'
        );
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setParsedPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseBackupJson(text);
      setParsedPreview(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Unable to read backup file.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-[#202023] border border-slate-200 dark:border-[#34343A] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E32] flex items-center justify-between bg-[#F8FAFC] dark:bg-[#1B1B1E]">
          <div>
            <h2
              id="backup-modal-title"
              className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              Local Storage &amp; JSON Backup
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Current workspace: {workspace.tabs.length} tabs ·{' '}
              {workspace.categories.length} categories ·{' '}
              {workspace.templates.length} templates
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close backup modal"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Native Windows Data Folder Info (visible when running as .exe) */}
          {isElectron && desktopDataPath && (
            <div className="p-3 rounded-md bg-[#F8FAFC] dark:bg-[#19191C] border border-slate-200 dark:border-[#2E2E32] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Windows Local Data File
                </div>
                <div
                  className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate"
                  title={desktopDataPath}
                >
                  {desktopDataPath}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void window.fluentDesktop?.openDataFolder()}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 dark:border-[#34343A] bg-white dark:bg-[#242428] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open Folder</span>
              </button>
            </div>
          )}

          {/* Export Section */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#2E2E32]">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Export Workspace Backup
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Save all tabs, categories, tags, and templates as a portable JSON file.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void downloadWorkspaceBackup(workspace)}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#4CC2FF] dark:hover:bg-[#38B6F8] text-white dark:text-[#0F172A] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>

          {/* Import Section */}
          <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-[#2E2E32]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Import from JSON Backup
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Restore a previously exported backup file by replacing or merging tabs.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => void handleChooseImportFile()}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-slate-200 dark:border-[#34343A] bg-white dark:bg-[#242428] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose File</span>
              </button>
            </div>

            {importError && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            {parsedPreview && (
              <div className="p-3.5 rounded-md bg-[#F8FAFC] dark:bg-[#19191C] border border-slate-200 dark:border-[#2E2E32] space-y-2.5">
                <p className="text-xs text-slate-700 dark:text-slate-200 tabular-nums">
                  Ready to import{' '}
                  <span className="font-semibold">{parsedPreview.tabs.length} tabs</span>,{' '}
                  <span className="font-semibold">
                    {parsedPreview.categories.length} categories
                  </span>
                  , and{' '}
                  <span className="font-semibold">
                    {parsedPreview.templates.length} templates
                  </span>
                  .
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onImportMerge(parsedPreview);
                      onClose();
                    }}
                    className="h-8 px-3 rounded-md bg-[#0067C0] dark:bg-[#4CC2FF] text-white dark:text-[#0F172A] text-xs font-semibold hover:opacity-95"
                  >
                    Merge Into Workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onImportReplace(parsedPreview);
                      onClose();
                    }}
                    className="h-8 px-3 rounded-md border border-slate-200 dark:border-[#34343A] bg-white dark:bg-[#242428] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    Replace Existing
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Starter Reset Section */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Restore Starter Templates
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Reverts local storage to the default sample workspace.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onResetStarter();
                    onClose();
                  }}
                  className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 dark:border-[#34343A] text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
