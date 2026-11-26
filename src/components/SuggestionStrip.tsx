import React from 'react';
import {
  Check,
  Folder,
  Hash,
  Info,
  Plus,
  RefreshCw,
  Type,
  X,
} from 'lucide-react';
import { TemplateCategory } from '../types/workspace';
import {
  isUntitled,
  normalizeComparisonKey,
  TemplateSuggestionResult,
} from '../utils/templateSuggestions';

interface SuggestionStripProps {
  result: TemplateSuggestionResult;
  currentTitle: string;
  currentCategoryId: string;
  currentTags: string[];
  categories: TemplateCategory[];
  titleVariantIndex: number;
  onApplyTitle: (title: string) => void;
  onApplyExistingCategory: (categoryId: string) => void;
  onCreateAndApplyCategory: (categoryName: string) => void;
  onApplyTag: (tag: string) => void;
  onApplyAll: () => void;
  onRefresh: () => void;
  onDismiss: () => void;
}

export const SuggestionStrip: React.FC<SuggestionStripProps> = ({
  result,
  currentTitle,
  currentCategoryId,
  currentTags,
  categories,
  titleVariantIndex,
  onApplyTitle,
  onApplyExistingCategory,
  onCreateAndApplyCategory,
  onApplyTag,
  onApplyAll,
  onRefresh,
  onDismiss,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDismiss();
    }
  };

  if (result.status === 'needs-more-content') {
    return (
      <section
        aria-label="Template suggestions"
        onKeyDown={handleKeyDown}
        className="px-4 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-subtle)] flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 min-w-0 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span className="truncate sm:whitespace-normal">
            Add a sentence or two to your template first so Notely can suggest a title, category, and tags.
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestions"
          className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-[var(--surface-hover)] shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </section>
    );
  }

  const normalizedCurrentTitle = currentTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const remainingTitles = result.titles.filter(
    (t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim() !== normalizedCurrentTitle
  );
  const activeTitle =
    remainingTitles.length > 0
      ? remainingTitles[titleVariantIndex % remainingTitles.length]
      : null;

  const existingCategoryKeys = new Set(
    categories.map((c) => normalizeComparisonKey(c.name))
  );
  const remainingCategories = result.categories.filter((cat) => {
    if (cat.kind === 'existing') {
      return Boolean(cat.id) && cat.id !== currentCategoryId;
    }
    return !existingCategoryKeys.has(normalizeComparisonKey(cat.name));
  });

  const currentTagKeys = new Set(
    currentTags.map((t) => normalizeComparisonKey(t))
  );
  const remainingTags = result.tags.filter(
    (t) => !currentTagKeys.has(normalizeComparisonKey(t.tag))
  );

  const hasAnyRemaining =
    Boolean(activeTitle) ||
    remainingCategories.length > 0 ||
    remainingTags.length > 0;

  // Safe non-destructive Apply All: adds remaining tags, assigns category only if unassigned,
  // and applies title only if the template is still untitled.
  const canApplyAll =
    remainingTags.length > 0 ||
    (Boolean(activeTitle) && isUntitled(currentTitle)) ||
    (remainingCategories.length > 0 && !currentCategoryId);

  return (
    <section
      aria-label="Template suggestions"
      onKeyDown={handleKeyDown}
      className="px-4 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-subtle)] space-y-2"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Suggestions
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {canApplyAll && (
            <button
              type="button"
              onClick={onApplyAll}
              className="inline-flex items-center gap-1 h-6 px-2.5 rounded text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            >
              <Check className="w-3 h-3" />
              <span>Apply All</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            title="Re-analyze template or cycle alternate title"
            aria-label="Refresh suggestions"
            className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss suggestions (Esc)"
            aria-label="Dismiss suggestions"
            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-[var(--surface-hover)] transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!hasAnyRemaining ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Looks well organized — no remaining suggestions for this template.
        </p>
      ) : (
        <div className="space-y-1.5">
          {/* Short Title Row */}
          {activeTitle && (
            <div className="flex items-center flex-wrap gap-2">
              <span className="w-16 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Title
              </span>
              <button
                type="button"
                onClick={() => onApplyTitle(activeTitle)}
                title={`Set template title to "${activeTitle}"`}
                className="inline-flex items-center gap-1.5 max-w-full h-7 px-2.5 rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
              >
                <Type className="w-3 h-3 opacity-65 shrink-0" />
                <span className="truncate">{activeTitle}</span>
              </button>
              {remainingTitles.length > 1 && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {(titleVariantIndex % remainingTitles.length) + 1}/{remainingTitles.length}
                </span>
              )}
            </div>
          )}

          {/* Category Row */}
          {remainingCategories.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="w-16 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Category
              </span>
              {remainingCategories.map((cat) =>
                cat.kind === 'existing' && cat.id ? (
                  <button
                    key={`cat-existing-${cat.id}`}
                    type="button"
                    onClick={() => onApplyExistingCategory(cat.id!)}
                    title={`Assign to existing category "${cat.name}"`}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                  >
                    <Folder className="w-3 h-3 opacity-65 shrink-0" />
                    <span>{cat.name}</span>
                  </button>
                ) : (
                  <button
                    key={`cat-new-${cat.name}`}
                    type="button"
                    onClick={() => onCreateAndApplyCategory(cat.name)}
                    title={`Create new category "${cat.name}" and assign`}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-dashed border-[var(--accent)]/60 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--accent)] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                  >
                    <Plus className="w-3 h-3 shrink-0" />
                    <span>{cat.name}</span>
                    <span className="text-[10px] opacity-75 ml-0.5">New</span>
                  </button>
                )
              )}
            </div>
          )}

          {/* Tags Row */}
          {remainingTags.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="w-16 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Tags
              </span>
              {remainingTags.map((item) =>
                item.kind === 'existing' ? (
                  <button
                    key={`tag-existing-${item.tag}`}
                    type="button"
                    onClick={() => onApplyTag(item.tag)}
                    title={`Add existing tag #${item.tag}`}
                    className="inline-flex items-center gap-0.5 h-6 px-2 rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                  >
                    <Hash className="w-3 h-3 opacity-55 shrink-0" />
                    <span>{item.tag}</span>
                  </button>
                ) : (
                  <button
                    key={`tag-new-${item.tag}`}
                    type="button"
                    onClick={() => onApplyTag(item.tag)}
                    title={`Add new tag #${item.tag}`}
                    className="inline-flex items-center gap-0.5 h-6 px-2 rounded border border-dashed border-[var(--accent)]/60 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--accent)] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                  >
                    <Plus className="w-3 h-3 shrink-0" />
                    <span>#{item.tag}</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
