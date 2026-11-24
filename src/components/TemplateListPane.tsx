import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  CheckSquare,
  Copy,
  FileText,
  Folder,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  CopyFormat,
  SnippetTemplate,
  SortOption,
  TemplateCategory,
  WorkspaceTab,
} from '../types/workspace';
import { extractVariables, getSnippetPreview } from '../utils/templateEngine';
import { TemplateContextMenu } from './TemplateContextMenu';

interface TemplateListPaneProps {
  templates: SnippetTemplate[];
  categories: TemplateCategory[];
  tabs: WorkspaceTab[];
  activeTabId: string;
  availableTags: string[];
  selectedTemplateId: string | null;
  copiedTemplateId: string | null;
  searchQuery: string;
  activeCategoryLabel: string;
  activeTag: string | null;
  sortBy: SortOption;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: SortOption) => void;
  onClearFilters: () => void;
  onSelectTemplate: (templateId: string) => void;
  onQuickCopyTemplate: (template: SnippetTemplate) => void;
  onCopyTemplateWithFormat: (template: SnippetTemplate, format: CopyFormat) => void;
  onEditTemplate: (templateId: string) => void;
  onCreateTemplate: () => void;
  onAssignTemplatesCategory: (templateIds: string[], categoryId: string) => void;
  onCreateCategoryAndAssign: (templateIds: string[], categoryName: string) => void;
  onMoveTemplatesToTab: (templateIds: string[], targetTabId: string) => void;
  onAddTagToTemplates: (templateIds: string[], tag: string) => void;
  onDuplicateTemplates: (templateIds: string[]) => void;
  onDeleteTemplates: (templateIds: string[]) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  targetIds: string[];
  clickedId: string;
}

export const TemplateListPane: React.FC<TemplateListPaneProps> = ({
  templates,
  categories,
  tabs,
  activeTabId,
  availableTags,
  selectedTemplateId,
  copiedTemplateId,
  searchQuery,
  activeCategoryLabel,
  activeTag,
  sortBy,
  onSearchChange,
  onSortChange,
  onClearFilters,
  onSelectTemplate,
  onQuickCopyTemplate,
  onCopyTemplateWithFormat,
  onEditTemplate,
  onCreateTemplate,
  onAssignTemplatesCategory,
  onCreateCategoryAndAssign,
  onMoveTemplatesToTab,
  onAddTagToTemplates,
  onDuplicateTemplates,
  onDeleteTemplates,
}) => {
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [lastAnchorId, setLastAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const categoryNameMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories]
  );
  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );

  // Reset multi-selection when switching project tabs
  useEffect(() => {
    setMultiSelectedIds(new Set());
    setIsSelectionMode(false);
    setConfirmingBulkDelete(false);
    setContextMenu(null);
  }, [activeTabId]);

  // Prune any selected IDs that are no longer visible in the current list
  useEffect(() => {
    const validIds = new Set(templates.map((t) => t.id));
    setMultiSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [templates]);

  // Escape exits selection mode when no context menu is open
  useEffect(() => {
    if (!isSelectionMode && multiSelectedIds.size === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contextMenu) {
        setMultiSelectedIds(new Set());
        setIsSelectionMode(false);
        setConfirmingBulkDelete(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectionMode, multiSelectedIds.size, contextMenu]);

  const hasFilters = Boolean(
    searchQuery.trim() || activeTag || activeCategoryLabel !== 'All Templates'
  );
  const showBulkBar = isSelectionMode || multiSelectedIds.size > 0;
  const selectedIdsArray = useMemo(
    () => Array.from(multiSelectedIds),
    [multiSelectedIds]
  );

  const exitSelectionMode = () => {
    setMultiSelectedIds(new Set());
    setIsSelectionMode(false);
    setConfirmingBulkDelete(false);
  };

  const toggleIdInSelection = (id: string) => {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastAnchorId(id);
    setConfirmingBulkDelete(false);
  };

  const handleRowClick = (e: React.MouseEvent, tpl: SnippetTemplate) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (e.shiftKey) {
      e.preventDefault();
      const anchor = lastAnchorId || selectedTemplateId || tpl.id;
      const startIdx = templates.findIndex((t) => t.id === anchor);
      const endIdx = templates.findIndex((t) => t.id === tpl.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const next = new Set(multiSelectedIds);
        for (let i = from; i <= to; i++) {
          next.add(templates[i].id);
        }
        setMultiSelectedIds(next);
        setIsSelectionMode(true);
        setConfirmingBulkDelete(false);
        return;
      }
    }

    if (isCtrlOrMeta || isSelectionMode) {
      e.preventDefault();
      setIsSelectionMode(true);
      toggleIdInSelection(tpl.id);
      return;
    }

    setLastAnchorId(tpl.id);
    onSelectTemplate(tpl.id);
  };

  const handleRowContextMenu = (e: React.MouseEvent, tpl: SnippetTemplate) => {
    e.preventDefault();
    e.stopPropagation();

    const targetIds =
      multiSelectedIds.size > 0 && multiSelectedIds.has(tpl.id)
        ? Array.from(multiSelectedIds)
        : [tpl.id];

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetIds,
      clickedId: tpl.id,
    });
  };

  const allVisibleSelected =
    templates.length > 0 && multiSelectedIds.size === templates.length;

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      setMultiSelectedIds(new Set());
    } else {
      setMultiSelectedIds(new Set(templates.map((t) => t.id)));
      setIsSelectionMode(true);
    }
    setConfirmingBulkDelete(false);
  };

  const contextMenuTargets = useMemo(() => {
    if (!contextMenu) return [];
    return contextMenu.targetIds
      .map((id) => templateById.get(id))
      .filter((t): t is SnippetTemplate => Boolean(t));
  }, [contextMenu, templateById]);

  return (
    <section
      aria-label="Templates list"
      className="w-full md:w-[340px] lg:w-[368px] shrink-0 h-full flex flex-col bg-[var(--surface-panel)] border-r border-[var(--surface-border)]"
    >
      {/* Search & Primary Action Header */}
      <div className="p-3 border-b border-[var(--surface-border)] space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter by title, text, or #tag..."
              aria-label="Filter templates"
              className="w-full h-9 pl-8 pr-7 text-[13px] bg-[var(--surface-input)] border border-[var(--surface-border)] rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onCreateTemplate}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        {/* Context, Multi-Select Toggle & Sort Row */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 truncate">
            <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
              {activeCategoryLabel}
            </span>
            {activeTag && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--accent)] font-medium truncate">
                  #{activeTag}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{templates.length}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {templates.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (showBulkBar) {
                    exitSelectionMode();
                  } else {
                    setIsSelectionMode(true);
                  }
                }}
                title={
                  showBulkBar
                    ? 'Exit multi-select (Esc)'
                    : 'Select multiple templates (or Ctrl+Click / right-click)'
                }
                aria-pressed={showBulkBar}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  showBulkBar
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-[var(--surface-hover)]'
                }`}
              >
                <CheckSquare className="w-3 h-3" />
                <span>Select</span>
              </button>
            )}

            <div className="flex items-center gap-1 shrink-0">
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <select
                aria-label="Sort templates"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="bg-transparent text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="updated" className="bg-[var(--surface-panel)]">
                  Recent
                </option>
                <option value="usage" className="bg-[var(--surface-panel)]">
                  Most Copied
                </option>
                <option value="title" className="bg-[var(--surface-panel)]">
                  Title A–Z
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Select Bulk Action Bar */}
      {showBulkBar && (
        <div className="px-3 py-2 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200 hover:text-[var(--accent)] transition-colors"
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="font-mono tabular-nums">
                  {multiSelectedIds.size} selected
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={exitSelectionMode}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              Done
            </button>
          </div>

          {multiSelectedIds.size > 0 && (
            <div className="flex items-center gap-1.5">
              {/* Quick Category Assign (1 category per template) */}
              <div className="relative flex-1 min-w-0">
                <Folder className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  aria-label="Assign selected templates to category"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__placeholder__') return;
                    onAssignTemplatesCategory(
                      selectedIdsArray,
                      val === '__unassigned__' ? '' : val
                    );
                    exitSelectionMode();
                  }}
                  className="w-full h-7 pl-6 pr-2 rounded-md border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[11.5px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  <option value="" disabled>
                    Assign category...
                  </option>
                  {sortedCategories.map((cat) => (
                    <option
                      key={cat.id}
                      value={cat.id}
                      className="bg-[var(--surface-panel)]"
                    >
                      {cat.name}
                    </option>
                  ))}
                  <option
                    value="__unassigned__"
                    className="bg-[var(--surface-panel)]"
                  >
                    Unassigned
                  </option>
                </select>
              </div>

              {confirmingBulkDelete ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTemplates(selectedIdsArray);
                      exitSelectionMode();
                    }}
                    className="h-7 px-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold transition-colors"
                  >
                    Delete ({multiSelectedIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingBulkDelete(false)}
                    className="h-7 px-1.5 rounded-md text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingBulkDelete(true)}
                  title={`Delete ${multiSelectedIds.size} selected template(s)`}
                  className="h-7 px-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 text-[11.5px] font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}

          {multiSelectedIds.size === 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Click templates to pick them, or right-click for more actions.
            </p>
          )}
        </div>
      )}

      {/* Template Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--surface-border)]">
        {templates.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] border border-[var(--surface-border)] flex items-center justify-center text-slate-400 mb-3">
              <FileText className="w-5 h-5" />
            </div>
            <p className="font-display text-sm font-semibold text-slate-800 dark:text-slate-200">
              {hasFilters ? 'No matching templates' : 'No templates yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[240px] leading-relaxed">
              {hasFilters
                ? 'Try adjusting your search keywords or clearing the active category/tag filter.'
                : 'Store your daily email replies, chat snippets, and documentation blocks here.'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              {hasFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="px-3 py-1.5 rounded-md border border-[var(--surface-border)] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-[var(--surface-hover)] transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={onCreateTemplate}
                className="px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold transition-colors"
              >
                Create Template
              </button>
            </div>
          </div>
        ) : (
          templates.map((tpl) => {
            const isSelected = tpl.id === selectedTemplateId;
            const isMultiChecked = multiSelectedIds.has(tpl.id);
            const isCopied = tpl.id === copiedTemplateId;
            const vars = extractVariables(tpl.content);
            const catName = categoryNameMap.get(tpl.categoryId) || 'Unassigned';
            const preview = getSnippetPreview(tpl.content, 115);

            return (
              <div
                key={tpl.id}
                role="button"
                tabIndex={0}
                onClick={(e) => handleRowClick(e, tpl)}
                onContextMenu={(e) => handleRowContextMenu(e, tpl)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isSelectionMode) {
                      toggleIdInSelection(tpl.id);
                    } else {
                      onSelectTemplate(tpl.id);
                    }
                  }
                }}
                className={`group relative px-3.5 py-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
                  isMultiChecked
                    ? 'bg-[var(--accent-soft-strong)]'
                    : isSelected
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {showBulkBar && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={
                        isMultiChecked
                          ? `Deselect ${tpl.title}`
                          : `Select ${tpl.title}`
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleIdInSelection(tpl.id);
                      }}
                      className="mt-0.5 shrink-0 text-slate-400 hover:text-[var(--accent)]"
                    >
                      {isMultiChecked ? (
                        <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={`font-display text-[13.5px] font-semibold leading-snug truncate ${
                          isMultiChecked || isSelected
                            ? 'text-[var(--accent)]'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {tpl.title || 'Untitled Template'}
                      </h3>

                      {!showBulkBar && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickCopyTemplate(tpl);
                          }}
                          title={
                            vars.length > 0
                              ? 'Fill variables & copy'
                              : 'Copy formatted template'
                          }
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[var(--surface-subtle)] border border-[var(--surface-border)] text-slate-700 dark:text-slate-200 hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-[var(--accent-fg)]'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>{vars.length > 0 ? 'Fill' : 'Copy'}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {preview || 'Empty template body'}
                    </p>

                    {/* Unboxed metadata row (Zero-pill discipline) */}
                    <div className="mt-2 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {catName}
                      </span>
                      {tpl.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[160px]">
                            {tpl.tags
                              .slice(0, 3)
                              .map((t) => `#${t}`)
                              .join(' ')}
                            {tpl.tags.length > 3 ? ` +${tpl.tags.length - 3}` : ''}
                          </span>
                        </>
                      )}
                      {vars.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[var(--accent)]">
                            {vars.length} {vars.length === 1 ? 'var' : 'vars'}
                          </span>
                        </>
                      )}
                      {tpl.usageCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {tpl.usageCount}×
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && contextMenuTargets.length > 0 && (
        <TemplateContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetTemplates={contextMenuTargets}
          categories={categories}
          tabs={tabs}
          activeTabId={activeTabId}
          availableTags={availableTags}
          isSelectionMode={isSelectionMode}
          isTargetInSelection={multiSelectedIds.has(contextMenu.clickedId)}
          onClose={() => setContextMenu(null)}
          onCopyTemplate={onCopyTemplateWithFormat}
          onEditTemplate={onEditTemplate}
          onAssignCategory={(ids, categoryId) => {
            onAssignTemplatesCategory(ids, categoryId);
            if (ids.length > 1) exitSelectionMode();
          }}
          onCreateCategoryAndAssign={(ids, categoryName) => {
            onCreateCategoryAndAssign(ids, categoryName);
            if (ids.length > 1) exitSelectionMode();
          }}
          onMoveToTab={(ids, targetTabId) => {
            onMoveTemplatesToTab(ids, targetTabId);
            if (ids.length > 1) exitSelectionMode();
          }}
          onAddTag={(ids, tag) => {
            onAddTagToTemplates(ids, tag);
            if (ids.length > 1) exitSelectionMode();
          }}
          onDuplicateTemplates={(ids) => {
            onDuplicateTemplates(ids);
            if (ids.length > 1) exitSelectionMode();
          }}
          onDeleteTemplates={(ids) => {
            onDeleteTemplates(ids);
            if (ids.length > 1) exitSelectionMode();
          }}
          onToggleSelectTarget={() => toggleIdInSelection(contextMenu.clickedId)}
          onEnterSelectionMode={() => {
            setIsSelectionMode(true);
            setMultiSelectedIds(new Set([contextMenu.clickedId]));
            setLastAnchorId(contextMenu.clickedId);
          }}
        />
      )}
    </section>
  );
};
