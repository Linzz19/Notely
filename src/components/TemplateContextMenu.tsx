import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  ChevronRight,
  Copy,
  CopyPlus,
  FileText,
  Folder,
  FolderInput,
  Hash,
  Pencil,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import {
  CopyFormat,
  SnippetTemplate,
  TemplateCategory,
  WorkspaceTab,
} from '../types/workspace';
import { extractVariables } from '../utils/templateEngine';
import { GhostTagInput } from './GhostTagInput';

interface TemplateContextMenuProps {
  x: number;
  y: number;
  targetTemplates: SnippetTemplate[];
  categories: TemplateCategory[];
  tabs: WorkspaceTab[];
  activeTabId: string;
  availableTags: string[];
  isSelectionMode: boolean;
  isTargetInSelection: boolean;
  onClose: () => void;
  onCopyTemplate: (template: SnippetTemplate, format: CopyFormat) => void;
  onEditTemplate: (templateId: string) => void;
  onAssignCategory: (templateIds: string[], categoryId: string) => void;
  onCreateCategoryAndAssign: (templateIds: string[], categoryName: string) => void;
  onMoveToTab: (templateIds: string[], targetTabId: string) => void;
  onAddTag: (templateIds: string[], tag: string) => void;
  onDuplicateTemplates: (templateIds: string[]) => void;
  onDeleteTemplates: (templateIds: string[]) => void;
  onToggleSelectTarget: () => void;
  onEnterSelectionMode: () => void;
}

type ActiveSubmenu = 'category' | 'tab' | null;

export const TemplateContextMenu: React.FC<TemplateContextMenuProps> = ({
  x,
  y,
  targetTemplates,
  categories,
  tabs,
  activeTabId,
  availableTags,
  isSelectionMode,
  isTargetInSelection,
  onClose,
  onCopyTemplate,
  onEditTemplate,
  onAssignCategory,
  onCreateCategoryAndAssign,
  onMoveToTab,
  onAddTag,
  onDuplicateTemplates,
  onDeleteTemplates,
  onToggleSelectTarget,
  onEnterSelectionMode,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');
  const [activeSubmenu, setActiveSubmenu] = useState<ActiveSubmenu>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const newCatInputRef = useRef<HTMLInputElement>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const count = targetTemplates.length;
  const isSingle = count === 1;
  const singleTemplate = isSingle ? targetTemplates[0] : null;
  const targetIds = targetTemplates.map((t) => t.id);
  const otherTabs = tabs.filter((t) => t.id !== activeTabId);
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  // Check if all target templates currently share a single category
  const commonCategoryId =
    count > 0 &&
    targetTemplates.every((t) => t.categoryId === targetTemplates[0].categoryId)
      ? targetTemplates[0].categoryId
      : null;

  // Exclude tags that are already applied to every targeted template
  const alreadyPresentOnAllTargets = useMemo(() => {
    if (targetTemplates.length === 0) return [];
    const firstTags = targetTemplates[0].tags.map((t) => t.toLowerCase());
    if (targetTemplates.length === 1) return firstTags;
    const otherTagSets = targetTemplates
      .slice(1)
      .map((tpl) => new Set(tpl.tags.map((t) => t.toLowerCase())));
    return firstTags.filter((tag) => otherTagSets.every((set) => set.has(tag)));
  }, [targetTemplates]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 10;
    const nextLeft = Math.max(
      pad,
      Math.min(x, window.innerWidth - rect.width - pad)
    );
    const nextTop = Math.max(
      pad,
      Math.min(y, window.innerHeight - rect.height - pad)
    );
    setCoords({ left: nextLeft, top: nextTop });
    setSubmenuSide(
      nextLeft + rect.width + 215 > window.innerWidth ? 'left' : 'right'
    );
  }, [x, y, isAddingTag, confirmingDelete]);

  useEffect(() => {
    if (isAddingCategory) newCatInputRef.current?.focus();
  }, [isAddingCategory]);

  useEffect(() => {
    if (isAddingTag) newTagInputRef.current?.focus();
  }, [isAddingTag]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const handleResize = () => onClose();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  if (count === 0) return null;

  const singleVars = singleTemplate ? extractVariables(singleTemplate.content) : [];

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    onCreateCategoryAndAssign(targetIds, trimmed);
    onClose();
  };

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTagName.trim().replace(/^#+/, '').toLowerCase();
    if (!cleaned) return;
    onAddTag(targetIds, cleaned);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Template actions"
      style={{ left: coords.left, top: coords.top }}
      className="fixed z-50 w-[224px] rounded-lg bg-[var(--surface-elevated)] border border-[var(--surface-border)] shadow-xl py-1 text-[12.5px] text-slate-800 dark:text-slate-100 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Multi-selection header */}
      {!isSingle && (
        <div className="px-3 py-1.5 mb-1 border-b border-[var(--surface-border)] flex items-center justify-between text-[11px] font-semibold text-[var(--accent)]">
          <span className="font-mono tabular-nums">{count} templates selected</span>
        </div>
      )}

      {/* Single-template quick actions */}
      {isSingle && singleTemplate && (
        <>
          <button
            type="button"
            role="menuitem"
            onMouseEnter={() => setActiveSubmenu(null)}
            onClick={() => {
              onCopyTemplate(singleTemplate, 'rich');
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>{singleVars.length > 0 ? 'Fill & Copy Formatted' : 'Copy Formatted'}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onMouseEnter={() => setActiveSubmenu(null)}
            onClick={() => {
              onCopyTemplate(singleTemplate, 'plain');
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-hover)] transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Copy Plain Text</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onMouseEnter={() => setActiveSubmenu(null)}
            onClick={() => {
              onEditTemplate(singleTemplate.id);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Edit Template</span>
          </button>

          <div className="my-1 border-t border-[var(--surface-border)]" />
        </>
      )}

      {/* Assign to Category (Single category per template — works for 1 or many) */}
      <div
        className="relative"
        onMouseEnter={() => setActiveSubmenu('category')}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={activeSubmenu === 'category'}
          onClick={() =>
            setActiveSubmenu((curr) => (curr === 'category' ? null : 'category'))
          }
          className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
            activeSubmenu === 'category'
              ? 'bg-[var(--surface-hover)] text-[var(--accent)]'
              : 'hover:bg-[var(--surface-hover)]'
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Assign to Category</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>

        {activeSubmenu === 'category' && (
          <div
            role="menu"
            aria-label="Categories"
            className={`absolute top-0 w-[208px] max-h-[280px] overflow-y-auto rounded-lg bg-[var(--surface-elevated)] border border-[var(--surface-border)] shadow-xl py-1 z-50 ${
              submenuSide === 'right' ? 'left-full ml-1' : 'right-full mr-1'
            }`}
          >
            <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              1 category per template
            </div>

            {sortedCategories.map((cat) => {
              const isCurrent = commonCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAssignCategory(targetIds, cat.id);
                    onClose();
                  }}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{cat.name}</span>
                  </span>
                  {isCurrent && (
                    <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  )}
                </button>
              );
            })}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAssignCategory(targetIds, '');
                onClose();
              }}
              className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-slate-500 dark:text-slate-400 hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span className="truncate">Unassigned</span>
              {commonCategoryId === '' && (
                <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              )}
            </button>

            <div className="my-1 border-t border-[var(--surface-border)]" />

            {isAddingCategory ? (
              <form
                onSubmit={handleCreateCategorySubmit}
                className="px-2 py-1 flex items-center gap-1"
              >
                <input
                  ref={newCatInputRef}
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category..."
                  maxLength={32}
                  className="flex-1 min-w-0 h-7 px-2 text-xs rounded bg-[var(--surface-input)] border border-[var(--accent)] text-slate-900 dark:text-slate-100 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Create and assign"
                  className="p-1 rounded bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
                >
                  <Check className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setIsAddingCategory(true)}
                className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>New Category...</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Move to Another Project Tab */}
      {otherTabs.length > 0 && (
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('tab')}
        >
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={activeSubmenu === 'tab'}
            onClick={() =>
              setActiveSubmenu((curr) => (curr === 'tab' ? null : 'tab'))
            }
            className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
              activeSubmenu === 'tab'
                ? 'bg-[var(--surface-hover)] text-[var(--accent)]'
                : 'hover:bg-[var(--surface-hover)]'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <FolderInput className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Move to Tab</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {activeSubmenu === 'tab' && (
            <div
              role="menu"
              aria-label="Project tabs"
              className={`absolute top-0 w-[196px] max-h-[240px] overflow-y-auto rounded-lg bg-[var(--surface-elevated)] border border-[var(--surface-border)] shadow-xl py-1 z-50 ${
                submenuSide === 'right' ? 'left-full ml-1' : 'right-full mr-1'
              }`}
            >
              {otherTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onMoveToTab(targetIds, tab.id);
                    onClose();
                  }}
                  className="w-full px-2.5 py-1.5 text-left truncate hover:bg-[var(--surface-hover)] transition-colors"
                >
                  {tab.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Tag (single or bulk) */}
      {isAddingTag ? (
        <form
          onSubmit={handleAddTagSubmit}
          onMouseEnter={() => setActiveSubmenu(null)}
          className="px-2.5 py-1.5 flex items-center gap-1"
        >
          <GhostTagInput
            inputRef={newTagInputRef}
            value={newTagName}
            onChange={setNewTagName}
            suggestions={availableTags}
            excludeTags={alreadyPresentOnAllTargets}
            placeholder="Tag name..."
            maxLength={24}
            ariaLabel="Tag name"
            containerClassName="flex-1 min-w-0 h-7 rounded bg-[var(--surface-input)] border border-[var(--accent)]"
            paddingClassName="px-2"
            inputTextClassName="text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          <button
            type="submit"
            aria-label="Apply tag"
            className="p-1 rounded bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
          >
            <Check className="w-3 h-3" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          role="menuitem"
          onMouseEnter={() => setActiveSubmenu(null)}
          onClick={() => setIsAddingTag(true)}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-hover)] transition-colors"
        >
          <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{isSingle ? 'Add Tag...' : `Add Tag to ${count}...`}</span>
        </button>
      )}

      {/* Duplicate */}
      <button
        type="button"
        role="menuitem"
        onMouseEnter={() => setActiveSubmenu(null)}
        onClick={() => {
          onDuplicateTemplates(targetIds);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-hover)] transition-colors"
      >
        <CopyPlus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>{isSingle ? 'Duplicate' : `Duplicate ${count} Templates`}</span>
      </button>

      <div className="my-1 border-t border-[var(--surface-border)]" />

      {/* Selection Mode toggle */}
      {isSingle && (
        <button
          type="button"
          role="menuitem"
          onMouseEnter={() => setActiveSubmenu(null)}
          onClick={() => {
            if (isSelectionMode) {
              onToggleSelectTarget();
            } else {
              onEnterSelectionMode();
            }
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[var(--surface-hover)] transition-colors"
        >
          {isSelectionMode && isTargetInSelection ? (
            <>
              <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Deselect Template</span>
            </>
          ) : (
            <>
              <CheckSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{isSelectionMode ? 'Select Template' : 'Select Multiple...'}</span>
            </>
          )}
        </button>
      )}

      {/* Delete with inline safety confirmation */}
      {confirmingDelete ? (
        <div
          onMouseEnter={() => setActiveSubmenu(null)}
          className="mx-1.5 my-1 p-2 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/70 space-y-1.5"
        >
          <p className="text-[11.5px] font-medium text-red-700 dark:text-red-300 leading-snug">
            Delete {isSingle ? 'this template' : `${count} templates`}?
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onDeleteTemplates(targetIds);
                onClose();
              }}
              className="flex-1 h-7 rounded bg-red-600 hover:bg-red-700 text-white text-[11.5px] font-semibold transition-colors"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="px-2.5 h-7 rounded text-[11.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          role="menuitem"
          onMouseEnter={() => setActiveSubmenu(null)}
          onClick={() => setConfirmingDelete(true)}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>{isSingle ? 'Delete Template' : `Delete ${count} Templates`}</span>
        </button>
      )}
    </div>
  );
};
