import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CornerDownLeft,
  DatabaseBackup,
  FolderOpen,
  HelpCircle,
  Moon,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react';
import {
  SnippetTemplate,
  TemplateCategory,
  ThemeMode,
  WorkspaceTab,
} from '../types/workspace';
import { extractVariables, getSnippetPreview } from '../utils/templateEngine';

interface CommandPaletteProps {
  tabs: WorkspaceTab[];
  categories: TemplateCategory[];
  templates: SnippetTemplate[];
  theme: ThemeMode;
  onClose: () => void;
  onCopyTemplate: (template: SnippetTemplate) => void;
  onJumpToTemplate: (template: SnippetTemplate) => void;
  onSelectTab: (tabId: string) => void;
  onCreateTemplate: () => void;
  onToggleTheme: () => void;
  onOpenBackup: () => void;
  onOpenGuide: () => void;
}

type PaletteItem =
  | {
      kind: 'template';
      id: string;
      template: SnippetTemplate;
      tabName: string;
      categoryName: string;
      varsCount: number;
      score: number;
    }
  | {
      kind: 'action';
      id: string;
      label: string;
      hint: string;
      run: () => void;
    };

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  tabs,
  categories,
  templates,
  theme,
  onClose,
  onCopyTemplate,
  onJumpToTemplate,
  onSelectTab,
  onCreateTemplate,
  onToggleTheme,
  onOpenBackup,
  onOpenGuide,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const tabMap = useMemo(() => new Map(tabs.map((t) => [t.id, t.name])), [tabs]);
  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const items: PaletteItem[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const isCommandMode = trimmed.startsWith('>');
    const cleanQuery = isCommandMode ? trimmed.slice(1).trim() : trimmed;

    const actionItems: Extract<PaletteItem, { kind: 'action' }>[] = [
      {
        kind: 'action',
        id: 'act-new-template',
        label: 'Create New Template',
        hint: 'Add a snippet in the active tab',
        run: () => {
          onClose();
          onCreateTemplate();
        },
      },
      {
        kind: 'action',
        id: 'act-toggle-theme',
        label: `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`,
        hint: 'Toggle Fluent appearance',
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        kind: 'action',
        id: 'act-backup',
        label: 'Export or Import JSON Backup',
        hint: 'Manage local workspace backups',
        run: () => {
          onClose();
          onOpenBackup();
        },
      },
      {
        kind: 'action',
        id: 'act-guide',
        label: 'Open User Guide & Feature Reference',
        hint: 'Learn variables, Quick Jump, and drag reorder',
        run: () => {
          onClose();
          onOpenGuide();
        },
      },
      ...tabs.map((tab) => ({
        kind: 'action' as const,
        id: `act-tab-${tab.id}`,
        label: `Switch to Tab: ${tab.name}`,
        hint: 'Jump to project tab',
        run: () => {
          onSelectTab(tab.id);
          onClose();
        },
      })),
    ];

    if (isCommandMode) {
      return actionItems.filter(
        (a) =>
          !cleanQuery ||
          a.label.toLowerCase().includes(cleanQuery) ||
          a.hint.toLowerCase().includes(cleanQuery)
      );
    }

    const tokens = cleanQuery.split(/\s+/).filter(Boolean);

    const matchedTemplates: PaletteItem[] = templates
      .map((tpl) => {
        const tabName = tabMap.get(tpl.tabId) || 'Workspace';
        const categoryName = catMap.get(tpl.categoryId) || 'Unassigned';
        const titleLower = tpl.title.toLowerCase();
        const tagsJoined = tpl.tags.join(' ').toLowerCase();
        const bodyLower = tpl.content.toLowerCase();
        const pathLower = `${tabName} ${categoryName}`.toLowerCase();

        if (tokens.length === 0) {
          return {
            kind: 'template' as const,
            id: tpl.id,
            template: tpl,
            tabName,
            categoryName,
            varsCount: extractVariables(tpl.content).length,
            score: tpl.usageCount,
          };
        }

        let score = 0;
        for (const tok of tokens) {
          const cleanTok = tok.replace(/^#/, '');
          const inTitle = titleLower.includes(cleanTok);
          const inTags = tagsJoined.includes(cleanTok);
          const inPath = pathLower.includes(cleanTok);
          const inBody = bodyLower.includes(cleanTok);

          if (!inTitle && !inTags && !inPath && !inBody) {
            return null;
          }
          if (inTitle) score += 10;
          if (inTags) score += 6;
          if (inPath) score += 4;
          if (inBody) score += 2;
        }

        return {
          kind: 'template' as const,
          id: tpl.id,
          template: tpl,
          tabName,
          categoryName,
          varsCount: extractVariables(tpl.content).length,
          score: score + Math.min(tpl.usageCount, 5),
        };
      })
      .filter((x): x is Extract<PaletteItem, { kind: 'template' }> => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    if (!cleanQuery) {
      return [...matchedTemplates, ...actionItems.slice(0, 3)];
    }

    const matchedActions = actionItems.filter((a) =>
      a.label.toLowerCase().includes(cleanQuery)
    );
    return [...matchedTemplates, ...matchedActions];
  }, [
    query,
    templates,
    tabs,
    tabMap,
    catMap,
    theme,
    onClose,
    onCreateTemplate,
    onToggleTheme,
    onOpenBackup,
    onOpenGuide,
    onSelectTab,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (items.length === 0 ? 0 : (prev + 1) % items.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        items.length === 0 ? 0 : (prev - 1 + items.length) % items.length
      );
      return;
    }
    if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault();
      const selected = items[activeIndex];
      if (selected.kind === 'action') {
        selected.run();
      } else if (e.shiftKey) {
        onJumpToTemplate(selected.template);
        onClose();
      } else {
        onClose();
        onCopyTemplate(selected.template);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        className="w-full max-w-2xl rounded-lg bg-white dark:bg-[#202023] border border-slate-200 dark:border-[#34343A] shadow-2xl overflow-hidden flex flex-col max-h-[74vh]"
      >
        {/* Search Input */}
        <div className="px-4 h-12 border-b border-slate-200 dark:border-[#2E2E32] flex items-center gap-3">
          <Search className="w-4 h-4 text-[#0067C0] dark:text-[#4CC2FF] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates across all tabs, #tags, or type > for commands..."
            className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear command search"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#2C2C30] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#3A3A3F]">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2A2E]">
          {items.length === 0 ? (
            <div className="py-12 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No templates or commands match <span className="font-medium text-slate-800 dark:text-slate-200">"{query}"</span>.
            </div>
          ) : (
            items.map((item, idx) => {
              const isActive = idx === activeIndex;

              if (item.kind === 'action') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={item.run}
                    className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                      isActive
                        ? 'bg-[#0067C0]/[0.08] dark:bg-[#4CC2FF]/[0.12]'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-slate-400 dark:text-slate-500">
                        {item.id === 'act-new-template' ? (
                          <Plus className="w-4 h-4" />
                        ) : item.id === 'act-toggle-theme' ? (
                          theme === 'light' ? (
                            <Moon className="w-4 h-4" />
                          ) : (
                            <Sun className="w-4 h-4" />
                          )
                        ) : item.id === 'act-backup' ? (
                          <DatabaseBackup className="w-4 h-4" />
                        ) : item.id === 'act-guide' ? (
                          <HelpCircle className="w-4 h-4" />
                        ) : (
                          <FolderOpen className="w-4 h-4" />
                        )}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                      {item.hint}
                    </span>
                  </button>
                );
              }

              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onClose();
                    onCopyTemplate(item.template);
                  }}
                  className={`px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                    isActive
                      ? 'bg-[#0067C0]/[0.08] dark:bg-[#4CC2FF]/[0.12]'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.template.title}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {item.tabName} / {item.categoryName}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {getSnippetPreview(item.template.content, 95)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.varsCount > 0 && (
                      <span className="font-mono text-[11px] text-[#0067C0] dark:text-[#4CC2FF] tabular-nums">
                        {item.varsCount}v
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToTemplate(item.template);
                        onClose();
                      }}
                      className="px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10"
                    >
                      Open
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Keyboard Hints Footer */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-[#2E2E32] bg-[#F8FAFC] dark:bg-[#1B1B1E] text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              <span>Copy / Quick-Fill</span>
            </span>
            <span>Shift+Enter to open in editor</span>
          </div>
          <span>↑↓ Navigate · &gt; Commands</span>
        </div>
      </div>
    </div>
  );
};
