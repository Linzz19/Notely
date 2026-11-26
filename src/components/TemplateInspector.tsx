import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Braces,
  Check,
  Code,
  Copy,
  CopyPlus,
  FileCode2,
  Heading2,
  Heading3,
  History,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Plus,
  Quote,
  Trash2,
  X,
} from 'lucide-react';
import {
  CopyFormat,
  InspectorViewMode,
  SnippetTemplate,
  TemplateCategory,
} from '../types/workspace';
import { extractVariables, markdownToHtml } from '../utils/templateEngine';
import {
  generateTemplateSuggestions,
  isUntitled,
  normalizeComparisonKey,
  TemplateSuggestionResult,
} from '../utils/templateSuggestions';
import { GhostTagInput } from './GhostTagInput';
import { SuggestionStrip } from './SuggestionStrip';

interface TemplateInspectorProps {
  template: SnippetTemplate | null;
  tabName: string;
  categories: TemplateCategory[];
  templatesInTab: SnippetTemplate[];
  availableTags: string[];
  viewMode: InspectorViewMode;
  copiedFormat: CopyFormat | null;
  onChangeViewMode: (mode: InspectorViewMode) => void;
  onUpdateTemplate: (
    templateId: string,
    patch: Partial<Pick<SnippetTemplate, 'title' | 'content' | 'categoryId' | 'tags'>>
  ) => void;
  onDuplicateTemplate: (template: SnippetTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCopyTemplate: (template: SnippetTemplate, format: CopyFormat) => void;
  onCreateCategoryInline: (name: string) => string;
  onCreateTemplate: () => void;
  onOpenCommandPalette: () => void;
  onOpenHistory: () => void;
  onEditorFocus?: (templateId: string) => void;
  onEditorBlur: () => void;
  onBackToListMobile: () => void;
  externalSyncVersion?: number;
}

export const TemplateInspector: React.FC<TemplateInspectorProps> = ({
  template,
  tabName,
  categories,
  templatesInTab,
  availableTags,
  viewMode,
  copiedFormat,
  onChangeViewMode,
  onUpdateTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onCopyTemplate,
  onCreateCategoryInline,
  onCreateTemplate,
  onOpenCommandPalette,
  onOpenHistory,
  onEditorFocus,
  onEditorBlur,
  onBackToListMobile,
  externalSyncVersion = 0,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isAddingInlineCat, setIsAddingInlineCat] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');
  const [suggestionResult, setSuggestionResult] =
    useState<TemplateSuggestionResult | null>(null);
  const [titleVariantIndex, setTitleVariantIndex] = useState(0);
  const [draftContent, setDraftContent] = useState(() => template?.content ?? '');
  const [draftTitle, setDraftTitle] = useState(() => template?.title ?? '');
  const lastSuggestedContentRef = useRef<string | null>(null);
  const prevTemplateIdRef = useRef<string | null>(null);
  const prevShowEditorRef = useRef<boolean>(false);
  const prevExternalSyncVersionRef = useRef<number>(externalSyncVersion);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showEditor = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  useEffect(() => {
    setConfirmDelete(false);
    setTagInput('');
    setIsAddingInlineCat(false);
    setInlineCatName('');
    setSuggestionResult(null);
    setTitleVariantIndex(0);
    lastSuggestedContentRef.current = null;
  }, [template?.id, tabName]);

  // Keep DOM-owned inputs in sync ONLY on template switch, editor mount, or
  // explicit external updates (Version History restore, backup import, remote
  // cloud merge) — NEVER during active local typing/pasting/backspacing.
  useLayoutEffect(() => {
    const nextId = template?.id ?? null;
    const nextContent = template?.content ?? '';
    const nextTitle = template?.title ?? '';

    const switchedTemplate = prevTemplateIdRef.current !== nextId;
    const editorJustMounted = showEditor && !prevShowEditorRef.current;
    const externalSyncChanged =
      prevExternalSyncVersionRef.current !== externalSyncVersion;

    prevTemplateIdRef.current = nextId;
    prevShowEditorRef.current = showEditor;
    prevExternalSyncVersionRef.current = externalSyncVersion;

    if (!switchedTemplate && !editorJustMounted && !externalSyncChanged) {
      return;
    }

    const textareaEl = textareaRef.current;
    const isTextareaFocused =
      textareaEl !== null && document.activeElement === textareaEl;

    if (switchedTemplate || editorJustMounted || !isTextareaFocused) {
      if (textareaEl && textareaEl.value !== nextContent) {
        textareaEl.value = nextContent;
      }
      setDraftContent(nextContent);
    }

    const titleEl = titleInputRef.current;
    const isTitleFocused =
      titleEl !== null && document.activeElement === titleEl;

    if (switchedTemplate || editorJustMounted || !isTitleFocused) {
      if (titleEl && titleEl.value !== nextTitle) {
        titleEl.value = nextTitle;
      }
      setDraftTitle(nextTitle);
    }
  }, [template?.id, template?.content, template?.title, showEditor, externalSyncVersion]);

  const detectedVariables = useMemo(
    () => (template ? extractVariables(draftContent) : []),
    [template?.id, draftContent]
  );

  const renderedPreviewHtml = useMemo(
    () =>
      template
        ? markdownToHtml(draftContent, { highlightVariables: true })
        : '',
    [template?.id, draftContent]
  );

  if (!template) {
    return (
      <main className="flex-1 min-w-0 h-full hidden md:flex flex-col items-center justify-center p-8 bg-[var(--surface-subtle)] text-center">
        <div className="max-w-sm space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Select a template to preview or edit
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Choose any snippet from the list, create a new template in{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">{tabName}</span>,
            or press <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--surface-frame)] border border-[var(--surface-border)]">Ctrl+K</kbd> to jump anywhere.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onCreateTemplate}
              className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold transition-colors"
            >
              Create Template
            </button>
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="px-4 py-2 rounded-md border border-[var(--surface-border)] bg-[var(--surface-panel)] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-[var(--surface-hover)] transition-colors"
            >
              Open Command Palette
            </button>
          </div>
        </div>
      </main>
    );
  }

  const activeCategoryName =
    categories.find((c) => c.id === template.categoryId)?.name || 'Unassigned';

  const insertFormatting = (
    prefix: string,
    suffix: string,
    placeholder: string,
    selectInserted = true
  ) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = el.value;
    const selected = current.slice(start, end) || placeholder;
    const nextContent =
      current.slice(0, start) + prefix + selected + suffix + current.slice(end);

    el.value = nextContent;
    setDraftContent(nextContent);
    onUpdateTemplate(template.id, { content: nextContent });

    el.focus();
    if (selectInserted) {
      el.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    } else {
      const cursor = start + prefix.length + selected.length + suffix.length;
      el.setSelectionRange(cursor, cursor);
    }
  };

  const insertLinePrefix = (linePrefix: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = el.value;

    const lineStart = current.lastIndexOf('\n', start - 1) + 1;
    const nextNewline = current.indexOf('\n', end);
    const lineEnd = nextNewline === -1 ? current.length : nextNewline;

    const block = current.slice(lineStart, lineEnd);
    const updatedBlock = block
      .split('\n')
      .map((line) => (line.startsWith(linePrefix) ? line : `${linePrefix}${line}`))
      .join('\n');

    const nextContent =
      current.slice(0, lineStart) + updatedBlock + current.slice(lineEnd);
    el.value = nextContent;
    setDraftContent(nextContent);
    onUpdateTemplate(template.id, { content: nextContent });

    el.focus();
    el.setSelectionRange(lineStart, lineStart + updatedBlock.length);
  };

  const handleAddTag = (raw: string) => {
    const cleaned = raw
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#+/, ''))
      .filter(Boolean);
    if (cleaned.length === 0) return;
    const merged = Array.from(new Set([...template.tags, ...cleaned]));
    onUpdateTemplate(template.id, { tags: merged });
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateTemplate(template.id, {
      tags: template.tags.filter((t) => t !== tagToRemove),
    });
  };

  const handleInlineCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inlineCatName.trim();
    if (trimmed) {
      const newCatId = onCreateCategoryInline(trimmed);
      onUpdateTemplate(template.id, { categoryId: newCatId });
    }
    setInlineCatName('');
    setIsAddingInlineCat(false);
  };

  const runLocalSuggester = () => {
    const next = generateTemplateSuggestions({
      template: { ...template, title: draftTitle, content: draftContent },
      categories,
      templatesInTab,
      availableTags,
    });
    lastSuggestedContentRef.current = draftContent;
    setSuggestionResult(next);
    setTitleVariantIndex(0);
  };

  const handleToggleSuggest = () => {
    if (
      suggestionResult !== null &&
      lastSuggestedContentRef.current === draftContent
    ) {
      setSuggestionResult(null);
      return;
    }
    runLocalSuggester();
  };

  const handleRefreshSuggestions = () => {
    const next = generateTemplateSuggestions({
      template: { ...template, title: draftTitle, content: draftContent },
      categories,
      templatesInTab,
      availableTags,
    });
    const sameTitles =
      suggestionResult !== null &&
      next.titles.length > 1 &&
      suggestionResult.titles.length === next.titles.length &&
      suggestionResult.titles.every((t, idx) => t === next.titles[idx]);

    lastSuggestedContentRef.current = draftContent;
    setSuggestionResult(next);
    setTitleVariantIndex((prev) => (sameTitles ? prev + 1 : 0));
  };

  const handleApplySuggestedTitle = (title: string) => {
    if (titleInputRef.current) {
      titleInputRef.current.value = title;
    }
    setDraftTitle(title);
    onUpdateTemplate(template.id, { title });
  };

  const handleApplySuggestedExistingCategory = (categoryId: string) => {
    onUpdateTemplate(template.id, { categoryId });
  };

  const handleCreateAndApplySuggestedCategory = (categoryName: string) => {
    const existing = categories.find(
      (c) => normalizeComparisonKey(c.name) === normalizeComparisonKey(categoryName)
    );
    const targetId = existing ? existing.id : onCreateCategoryInline(categoryName);
    if (targetId) {
      onUpdateTemplate(template.id, { categoryId: targetId });
    }
  };

  const handleApplySuggestedTag = (tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/^#+/, '');
    if (!clean) return;
    const key = normalizeComparisonKey(clean);
    const alreadyExists = template.tags.some(
      (existing) => normalizeComparisonKey(existing) === key
    );
    if (alreadyExists) return;
    onUpdateTemplate(template.id, { tags: [...template.tags, clean] });
  };

  const handleApplyAllSuggestions = () => {
    if (!suggestionResult || suggestionResult.status !== 'ready') return;
    const patch: Partial<Pick<SnippetTemplate, 'title' | 'categoryId' | 'tags'>> = {};

    // Apply short title only if the template is still untitled
    if (isUntitled(draftTitle) && suggestionResult.titles.length > 0) {
      const nextTitle =
        suggestionResult.titles[titleVariantIndex % suggestionResult.titles.length];
      patch.title = nextTitle;
      if (titleInputRef.current) {
        titleInputRef.current.value = nextTitle;
      }
      setDraftTitle(nextTitle);
    }

    // Assign top suggested category only if template is currently unassigned
    if (!template.categoryId && suggestionResult.categories.length > 0) {
      const topCat = suggestionResult.categories[0];
      if (topCat.kind === 'existing' && topCat.id) {
        patch.categoryId = topCat.id;
      } else {
        const existing = categories.find(
          (c) =>
            normalizeComparisonKey(c.name) === normalizeComparisonKey(topCat.name)
        );
        const createdId = existing
          ? existing.id
          : onCreateCategoryInline(topCat.name);
        if (createdId) {
          patch.categoryId = createdId;
        }
      }
    }

    // Merge all non-duplicate suggested tags
    const currentKeys = new Set(
      template.tags.map((t) => normalizeComparisonKey(t))
    );
    const nextTags = [...template.tags];
    for (const item of suggestionResult.tags) {
      const key = normalizeComparisonKey(item.tag);
      if (!currentKeys.has(key)) {
        currentKeys.add(key);
        nextTags.push(item.tag);
      }
    }
    if (nextTags.length > template.tags.length) {
      patch.tags = nextTags;
    }

    if (Object.keys(patch).length > 0) {
      onUpdateTemplate(template.id, patch);
    }
  };

  const updatedLabel = new Date(template.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <main className="flex-1 min-w-0 h-full flex flex-col bg-[var(--surface-panel)]">
      {/* Top Action Toolbar */}
      <div className="px-4 py-2.5 border-b border-[var(--surface-border)] flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-sidebar)]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackToListMobile}
            aria-label="Back to template list"
            className="md:hidden p-1.5 -ml-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Segmented Mode Control */}
          <div className="flex items-center p-0.5 rounded-md bg-[var(--surface-frame)] border border-[var(--surface-border)]">
            {(['preview', 'split', 'edit'] as InspectorViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  onEditorBlur();
                  onChangeViewMode(mode);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                  viewMode === mode
                    ? 'bg-[var(--surface-elevated)] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                } ${mode === 'split' ? 'hidden xl:inline-flex' : ''}`}
              >
                {mode}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 truncate">
            {tabName} / {activeCategoryName}
          </span>
        </div>

        {/* Copy & Management Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onCopyTemplate(template, 'rich')}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              copiedFormat === 'rich'
                ? 'bg-emerald-600 text-white'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)]'
            }`}
          >
            {copiedFormat === 'rich' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied Formatted</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>
                  {detectedVariables.length > 0 ? 'Fill & Copy Formatted' : 'Copy Formatted'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onCopyTemplate(template, 'plain')}
            title="Copy stripped plain text"
            className={`flex items-center gap-1 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              copiedFormat === 'plain'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-[var(--surface-border)] bg-[var(--surface-elevated)] text-slate-700 dark:text-slate-200 hover:bg-[var(--surface-hover)]'
            }`}
          >
            {copiedFormat === 'plain' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5 opacity-70" />
            )}
            <span>Plain</span>
          </button>

          <button
            type="button"
            onClick={() => onCopyTemplate(template, 'markdown')}
            title="Copy raw Markdown source"
            className={`flex items-center gap-1 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              copiedFormat === 'markdown'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-[var(--surface-border)] bg-[var(--surface-elevated)] text-slate-700 dark:text-slate-200 hover:bg-[var(--surface-hover)]'
            }`}
          >
            {copiedFormat === 'markdown' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <FileCode2 className="w-3.5 h-3.5 opacity-70" />
            )}
            <span>MD</span>
          </button>

          <div className="h-4 w-px bg-[var(--surface-border)] mx-0.5" />

          <button
            type="button"
            onClick={() => {
              onEditorBlur();
              onOpenHistory();
            }}
            title="View & restore last 3 saved content versions"
            aria-label="Template version history"
            className="flex items-center gap-1 h-8 px-2 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
            {(template.history?.length ?? 0) > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-[var(--accent)]">
                {template.history?.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onDuplicateTemplate(template)}
            title="Duplicate template"
            aria-label="Duplicate template"
            className="h-8 w-8 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] transition-colors"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1 pl-1">
              <button
                type="button"
                onClick={() => onDeleteTemplate(template.id)}
                className="h-8 px-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-8 px-2 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete template"
              aria-label="Delete template"
              className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area (Preview, Split, or Edit) */}
      <div
        className={`flex-1 min-h-0 flex ${
          viewMode === 'split' ? 'divide-x divide-[var(--surface-border)]' : ''
        }`}
      >
        {/* Editor Column */}
        {showEditor && (
          <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
            {/* Title, Category & Tag Metadata Inputs */}
            <div className="p-4 border-b border-[var(--surface-border)] space-y-3">
              <input
                ref={titleInputRef}
                type="text"
                onFocus={() => onEditorFocus?.(template.id)}
                onBlur={onEditorBlur}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  setDraftTitle(nextTitle);
                  onUpdateTemplate(template.id, { title: nextTitle });
                }}
                placeholder="Template title..."
                aria-label="Template title"
                className="w-full font-display text-lg font-semibold bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-3">
                {/* Category Selector */}
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="template-category-select"
                    className="text-xs font-medium text-slate-500 dark:text-slate-400"
                  >
                    Category
                  </label>
                  {isAddingInlineCat ? (
                    <form
                      onSubmit={handleInlineCategorySubmit}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        placeholder="New category..."
                        className="w-32 h-7 px-2 text-xs bg-[var(--surface-input)] border border-[var(--accent)] rounded text-slate-900 dark:text-slate-100 focus:outline-none"
                      />
                      <button
                        type="submit"
                        aria-label="Confirm category"
                        className="p-1 text-[var(--accent)]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingInlineCat(false)}
                        aria-label="Cancel category"
                        className="p-1 text-slate-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <select
                        id="template-category-select"
                        value={template.categoryId}
                        onChange={(e) =>
                          onUpdateTemplate(template.id, {
                            categoryId: e.target.value,
                          })
                        }
                        className="h-7 px-2 text-xs font-medium bg-[var(--surface-input)] border border-[var(--surface-border)] rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">Unassigned</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setIsAddingInlineCat(true)}
                        title="Create new category"
                        className="h-7 px-1.5 rounded border border-[var(--surface-border)] text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-[var(--surface-hover)]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tags Editor */}
                <div className="flex-1 min-w-[200px] flex items-center flex-wrap gap-1.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tags
                  </span>
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#2A2A2F] px-2 py-0.5 rounded"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <GhostTagInput
                    value={tagInput}
                    onChange={setTagInput}
                    suggestions={availableTags}
                    excludeTags={template.tags}
                    allowCommaSeparated
                    placeholder="+ Add tag (Enter)"
                    ariaLabel="Add tag"
                    containerClassName="min-w-[140px] flex-1 max-w-[260px] h-7"
                    paddingClassName="px-1.5"
                    inputTextClassName="text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      } else if (
                        e.key === 'Backspace' &&
                        !tagInput &&
                        template.tags.length > 0
                      ) {
                        handleRemoveTag(template.tags[template.tags.length - 1]);
                      }
                    }}
                    onBlur={() => {
                      if (tagInput.trim()) handleAddTag(tagInput);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* On-Demand Local Smart Suggestions Strip */}
            {suggestionResult && (
              <SuggestionStrip
                result={suggestionResult}
                currentTitle={draftTitle}
                currentCategoryId={template.categoryId}
                currentTags={template.tags}
                categories={categories}
                titleVariantIndex={titleVariantIndex}
                onApplyTitle={handleApplySuggestedTitle}
                onApplyExistingCategory={handleApplySuggestedExistingCategory}
                onCreateAndApplyCategory={handleCreateAndApplySuggestedCategory}
                onApplyTag={handleApplySuggestedTag}
                onApplyAll={handleApplyAllSuggestions}
                onRefresh={handleRefreshSuggestions}
                onDismiss={() => setSuggestionResult(null)}
              />
            )}

            {/* Formatting Toolbar */}
            <div className="px-3 py-1.5 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center flex-wrap gap-1">
              <ToolbarButton
                icon={<Heading2 className="w-3.5 h-3.5" />}
                label="Heading 2"
                onClick={() => insertLinePrefix('## ')}
              />
              <ToolbarButton
                icon={<Heading3 className="w-3.5 h-3.5" />}
                label="Heading 3"
                onClick={() => insertLinePrefix('### ')}
              />
              <div className="h-4 w-px bg-[var(--surface-border)] mx-0.5" />
              <ToolbarButton
                icon={<Bold className="w-3.5 h-3.5" />}
                label="Bold"
                onClick={() => insertFormatting('**', '**', 'bold text')}
              />
              <ToolbarButton
                icon={<Italic className="w-3.5 h-3.5" />}
                label="Italic"
                onClick={() => insertFormatting('*', '*', 'italic text')}
              />
              <ToolbarButton
                icon={<Link2 className="w-3.5 h-3.5" />}
                label="Link"
                onClick={() =>
                  insertFormatting('[', '](https://example.com)', 'link label')
                }
              />
              <div className="h-4 w-px bg-[var(--surface-border)] mx-0.5" />
              <ToolbarButton
                icon={<List className="w-3.5 h-3.5" />}
                label="Bullet list"
                onClick={() => insertLinePrefix('- ')}
              />
              <ToolbarButton
                icon={<ListOrdered className="w-3.5 h-3.5" />}
                label="Numbered list"
                onClick={() => insertLinePrefix('1. ')}
              />
              <ToolbarButton
                icon={<Quote className="w-3.5 h-3.5" />}
                label="Blockquote"
                onClick={() => insertLinePrefix('> ')}
              />
              <ToolbarButton
                icon={<Code className="w-3.5 h-3.5" />}
                label="Inline code"
                onClick={() => insertFormatting('`', '`', 'code')}
              />
              <div className="h-4 w-px bg-[var(--surface-border)] mx-0.5" />
              <button
                type="button"
                onClick={() =>
                  insertFormatting('{{', '}}', 'variable_name')
                }
                className="flex items-center gap-1 h-7 px-2 rounded text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors whitespace-nowrap"
                title="Insert dynamic variable placeholder"
              >
                <Braces className="w-3.5 h-3.5" />
                <span>Insert {'{{var}}'}</span>
              </button>
              <button
                type="button"
                onClick={handleToggleSuggest}
                aria-pressed={suggestionResult !== null}
                title="Suggest a short title, category, and tags offline from this template"
                className={`ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  suggestionResult !== null
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-[var(--surface-hover)] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Suggest</span>
              </button>
            </div>

            {/* Markdown Body Textarea (DOM-owned to prevent cursor jumps) */}
            <div className="flex-1 min-h-0 flex flex-col">
              <textarea
                ref={textareaRef}
                onFocus={() => onEditorFocus?.(template.id)}
                onChange={(e) => {
                  const nextContent = e.target.value;
                  setDraftContent(nextContent);
                  onUpdateTemplate(template.id, { content: nextContent });
                }}
                onBlur={onEditorBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    insertFormatting('  ', '', '', false);
                  }
                }}
                placeholder="Write your email, chat, or documentation template in Markdown... Use {{customer_name}} or {{company|Acme}} for quick-fill variables."
                aria-label="Template content editor"
                className="flex-1 w-full p-4 resize-none bg-[var(--surface-panel)] text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none font-sans"
              />
              <div className="px-4 py-2 border-t border-[var(--surface-border)] text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
                <span>
                  Supports Markdown formatting &amp;{' '}
                  <code className="font-mono text-slate-600 dark:text-slate-300">
                    {'{{variable|default}}'}
                  </code>{' '}
                  placeholders
                </span>
                <span className="font-mono tabular-nums">
                  {draftContent.length} chars
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Formatted Preview Column */}
        {showPreview && (
          <div className="flex-1 min-w-0 h-full overflow-y-auto p-5 sm:p-7 bg-[var(--surface-panel)]">
            <div className="max-w-3xl space-y-5">
              {/* Preview Header (only when not showing editor header in split mode) */}
              {viewMode === 'preview' && (
                <header className="pb-4 border-b border-[var(--surface-border)] space-y-2">
                  <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 text-balance">
                    {template.title || 'Untitled Template'}
                  </h1>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {activeCategoryName}
                    </span>
                    {template.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{template.tags.map((t) => `#${t}`).join('  ')}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Updated {updatedLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Copied {template.usageCount}×
                    </span>
                  </div>
                </header>
              )}

              {/* Detected Dynamic Variables Banner (clean hairline container, no thick left border) */}
              {detectedVariables.length > 0 && (
                <div className="px-3.5 py-2.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--surface-border)] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      Dynamic variables:
                    </span>
                    {detectedVariables.map((v) => (
                      <code
                        key={v.name}
                        className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]"
                      >
                        {v.defaultValue ? `{{${v.name}|${v.defaultValue}}}` : `{{${v.name}}}`}
                      </code>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onCopyTemplate(template, 'rich')}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
                  >
                    Fill &amp; Copy →
                  </button>
                </div>
              )}

              {/* Rendered Rich Output */}
              {draftContent.trim() ? (
                <div
                  className="template-prose text-slate-800 dark:text-slate-200"
                  dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
                />
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                  This template has no content yet. Switch to Edit mode to add text.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className="h-7 w-7 flex items-center justify-center rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
  >
    {icon}
  </button>
);
