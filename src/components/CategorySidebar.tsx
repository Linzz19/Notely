import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Folder,
  FolderOpen,
  GripVertical,
  Hash,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { SnippetTemplate, TemplateCategory } from '../types/workspace';

interface CategorySidebarProps {
  activeTabName: string;
  categories: TemplateCategory[];
  templatesInTab: SnippetTemplate[];
  activeCategoryId: string;
  activeTag: string | null;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectCategory: (categoryId: string) => void;
  onSelectTag: (tag: string | null) => void;
  onCreateCategory: (name: string) => void;
  onRenameCategory: (categoryId: string, newName: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onReorderCategories: (orderedCategoryIds: string[]) => void;
}

interface CatRectSnapshot {
  id: string;
  height: number;
  centerY: number;
}

interface CatDragState {
  catId: string;
  startIdx: number;
  targetIdx: number;
  startY: number;
  deltaY: number;
  isDragging: boolean;
  isReturning: boolean;
  snapshots: CatRectSnapshot[];
  gap: number;
}

const DRAG_THRESHOLD_PX = 5;

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  activeTabName,
  categories,
  templatesInTab,
  activeCategoryId,
  activeTag,
  isMobileOpen,
  onCloseMobile,
  onSelectCategory,
  onSelectTag,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onReorderCategories,
}) => {
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<CatDragState | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const catElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<CatDragState | null>(null);
  dragStateRef.current = dragState;

  useEffect(() => {
    if (isAddingCat) addInputRef.current?.focus();
  }, [isAddingCat]);

  useEffect(() => {
    if (editingCatId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingCatId]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const sortedCategoriesRef = useRef(sortedCategories);
  sortedCategoriesRef.current = sortedCategories;

  // Smooth vertical pointer drag for categories
  useEffect(() => {
    if (!dragState || dragState.isReturning) return;

    if (dragState.isDragging) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    const handlePointerMove = (e: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || current.isReturning) return;

      const deltaY = e.clientY - current.startY;
      if (!current.isDragging && Math.abs(deltaY) < DRAG_THRESHOLD_PX) {
        return;
      }

      const startSnap = current.snapshots[current.startIdx];
      if (!startSnap) return;

      const currentCenterY = startSnap.centerY + deltaY;
      let upCrossings = 0;
      let downCrossings = 0;

      for (let i = 0; i < current.snapshots.length; i++) {
        if (i < current.startIdx && currentCenterY < current.snapshots[i].centerY) {
          upCrossings++;
        } else if (i > current.startIdx && currentCenterY > current.snapshots[i].centerY) {
          downCrossings++;
        }
      }

      const nextTargetIdx = current.startIdx - upCrossings + downCrossings;

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              isDragging: true,
              deltaY,
              targetIdx: nextTargetIdx,
            }
          : null
      );
    };

    const handlePointerUp = () => {
      const current = dragStateRef.current;
      if (!current) return;

      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (!current.isDragging) {
        setDragState(null);
        return;
      }

      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);

      if (current.targetIdx !== current.startIdx) {
        const ids = current.snapshots.map((s) => s.id);
        const [moved] = ids.splice(current.startIdx, 1);
        ids.splice(current.targetIdx, 0, moved);
        onReorderCategories(ids);
        setDragState(null);
      } else {
        // Did not drag far enough to realign: smoothly glide back
        setDragState((prev) =>
          prev ? { ...prev, isReturning: true, deltaY: 0 } : null
        );
        window.setTimeout(() => {
          setDragState(null);
        }, 160);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState?.catId, dragState?.isDragging, dragState?.isReturning, onReorderCategories]);

  const startCategoryPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    catId: string,
    index: number
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (editingCatId || confirmDeleteCatId) return;

    const currentCats = sortedCategoriesRef.current;
    const snapshots: CatRectSnapshot[] = currentCats.map((c) => {
      const el = catElementsRef.current.get(c.id);
      const rect = el?.getBoundingClientRect();
      return {
        id: c.id,
        height: rect?.height ?? 34,
        centerY: rect ? rect.top + rect.height / 2 : 0,
      };
    });

    let gap = 2;
    if (currentCats.length > 1) {
      const firstEl = catElementsRef.current.get(currentCats[0].id);
      const secondEl = catElementsRef.current.get(currentCats[1].id);
      if (firstEl && secondEl) {
        gap = Math.max(
          0,
          secondEl.getBoundingClientRect().top - firstEl.getBoundingClientRect().bottom
        );
      }
    }

    setDragState({
      catId,
      startIdx: index,
      targetIdx: index,
      startY: e.clientY,
      deltaY: 0,
      isDragging: false,
      isReturning: false,
      snapshots,
      gap,
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCatName.trim()) {
      onCreateCategory(newCatName.trim());
    }
    setNewCatName('');
    setIsAddingCat(false);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCatId && editingCatName.trim()) {
      onRenameCategory(editingCatId, editingCatName.trim());
    }
    setEditingCatId(null);
    setEditingCatName('');
  };

  // Count templates per category and unassigned
  const categoryCounts = new Map<string, number>();
  let uncategorizedCount = 0;
  const validCatSet = new Set(categories.map((c) => c.id));

  for (const tpl of templatesInTab) {
    if (tpl.categoryId && validCatSet.has(tpl.categoryId)) {
      categoryCounts.set(tpl.categoryId, (categoryCounts.get(tpl.categoryId) || 0) + 1);
    } else {
      uncategorizedCount++;
    }
  }

  // Compute unique tags in active tab with frequency
  const tagCounts = new Map<string, number>();
  for (const tpl of templatesInTab) {
    for (const tag of tpl.tags) {
      const normalized = tag.trim().toLowerCase();
      if (normalized) {
        tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
      }
    }
  }
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const sidebarContent = (
    <aside className="w-64 h-full flex flex-col bg-[var(--surface-sidebar)] border-r border-[var(--surface-border)] select-none">
      {/* Active Tab Header */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-[var(--surface-border)] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Workspace Tab
          </div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {activeTabName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          title="Close categories panel (Esc)"
          className="app-no-drag lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-[var(--surface-hover)] dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Categories + Tags */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {/* Categories Section */}
        <div>
          <div className="px-2 mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Categories
            </span>
            <button
              type="button"
              onClick={() => setIsAddingCat(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
              title="Add category to this tab"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          {isAddingCat && (
            <form onSubmit={handleAddSubmit} className="px-1.5 mb-2 flex items-center gap-1">
              <input
                ref={addInputRef}
                type="text"
                placeholder="Category name..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsAddingCat(false);
                    setNewCatName('');
                  }
                }}
                maxLength={32}
                className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--surface-panel)] border border-[var(--accent)] rounded text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Save category"
                className="p-1 rounded text-[var(--accent)] hover:bg-[var(--surface-hover)]"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCat(false);
                  setNewCatName('');
                }}
                aria-label="Cancel category"
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          <div className="space-y-0.5">
            {/* All Templates */}
            <button
              type="button"
              onClick={() => {
                onSelectCategory('all');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] transition-colors ${
                activeCategoryId === 'all'
                  ? 'bg-[var(--surface-elevated)] text-slate-900 dark:text-slate-100 font-semibold shadow-xs border border-[var(--surface-border)]'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-[var(--surface-hover)] font-medium border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate">All Templates</span>
              </span>
              <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500 ml-2 shrink-0">
                {templatesInTab.length}
              </span>
            </button>

            {sortedCategories.map((cat, index) => {
              const isSelected = activeCategoryId === cat.id;
              const isEditing = editingCatId === cat.id;
              const isConfirmingDelete = confirmDeleteCatId === cat.id;
              const count = categoryCounts.get(cat.id) || 0;

              if (isEditing) {
                return (
                  <form key={cat.id} onSubmit={handleRenameSubmit} className="px-1 py-0.5">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingCatId(null);
                          setEditingCatName('');
                        }
                      }}
                      maxLength={32}
                      className="w-full px-2.5 py-1.5 text-[13px] bg-[var(--surface-panel)] border border-[var(--accent)] rounded-md text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                  </form>
                );
              }

              if (isConfirmingDelete) {
                return (
                  <div
                    key={cat.id}
                    className="p-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 space-y-1.5"
                  >
                    <p className="text-xs text-red-700 dark:text-red-300 leading-snug">
                      Remove <span className="font-semibold">{cat.name}</span>?
                      {count > 0 ? ` ${count} template(s) move to Unassigned.` : ''}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteCategory(cat.id);
                          setConfirmDeleteCatId(null);
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCatId(null)}
                        className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              // Compute live vertical transform during active pointer drag
              let translateY = 0;
              const isThisDragged =
                dragState?.isDragging && dragState.catId === cat.id;

              if (dragState?.isDragging) {
                if (isThisDragged) {
                  translateY = dragState.deltaY;
                } else {
                  const draggedHeight =
                    dragState.snapshots[dragState.startIdx]?.height ?? 34;
                  const shift = draggedHeight + dragState.gap;
                  if (
                    dragState.startIdx < dragState.targetIdx &&
                    index > dragState.startIdx &&
                    index <= dragState.targetIdx
                  ) {
                    translateY = -shift;
                  } else if (
                    dragState.startIdx > dragState.targetIdx &&
                    index < dragState.startIdx &&
                    index >= dragState.targetIdx
                  ) {
                    translateY = shift;
                  }
                }
              }

              return (
                <div
                  key={cat.id}
                  ref={(el) => {
                    if (el) {
                      catElementsRef.current.set(cat.id, el);
                    } else {
                      catElementsRef.current.delete(cat.id);
                    }
                  }}
                  onPointerDown={(e) => startCategoryPointerDown(e, cat.id, index)}
                  style={{
                    transform:
                      translateY !== 0
                        ? `translate3d(0, ${translateY}px, 0)`
                        : undefined,
                    transition:
                      isThisDragged && !dragState?.isReturning
                        ? 'none'
                        : dragState?.isDragging
                        ? 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1)'
                        : undefined,
                  }}
                  className={`group relative flex items-center justify-between pl-1.5 pr-2.5 py-1.5 rounded-md border ${
                    isThisDragged
                      ? 'z-30 shadow-md cursor-grabbing bg-[var(--surface-elevated)] border-[var(--accent)] text-slate-900 dark:text-slate-100 font-semibold'
                      : isSelected
                      ? 'cursor-grab bg-[var(--surface-elevated)] text-slate-900 dark:text-slate-100 font-semibold shadow-xs border-[var(--surface-border)] transition-colors'
                      : 'cursor-grab text-slate-700 dark:text-slate-300 hover:bg-[var(--surface-hover)] font-medium border-transparent transition-colors'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (suppressClickRef.current) return;
                      onSelectCategory(cat.id);
                      onCloseMobile();
                    }}
                    title="Click to filter · Drag to reorder"
                    className={`flex items-center gap-1.5 min-w-0 flex-1 text-left py-0.5 text-[13px] focus-visible:outline-none ${
                      isThisDragged ? 'cursor-grabbing' : 'cursor-grab'
                    }`}
                  >
                    <GripVertical className="w-3 h-3 shrink-0 text-slate-400/70 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    {isSelected ? (
                      <FolderOpen className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                    ) : (
                      <Folder className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                    )}
                    <span className="truncate">{cat.name}</span>
                  </button>

                  <div
                    data-no-drag="true"
                    className="flex items-center gap-1 shrink-0 ml-1.5"
                  >
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditingCatName(cat.name);
                        }}
                        aria-label={`Rename ${cat.name}`}
                        title="Rename category"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-white/10"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCatId(cat.id)}
                        aria-label={`Delete ${cat.name}`}
                        title="Delete category"
                        className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500 group-hover:hidden">
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}

            {uncategorizedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('uncategorized');
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] transition-colors border ${
                  activeCategoryId === 'uncategorized'
                    ? 'bg-[var(--surface-elevated)] text-slate-900 dark:text-slate-100 font-semibold shadow-xs border-[var(--surface-border)]'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-[var(--surface-hover)] font-medium border-transparent'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="truncate">Unassigned</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500 ml-2">
                  {uncategorizedCount}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Tags / Keywords Filter Section */}
        <div className="pt-4 border-t border-[var(--surface-border)]">
          <div className="px-2 mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Tags & Keywords
            </span>
            {activeTag && (
              <button
                type="button"
                onClick={() => onSelectTag(null)}
                className="text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {sortedTags.length === 0 ? (
            <p className="px-2 text-xs text-slate-400 dark:text-slate-500">
              Add tags to templates to filter by keyword here.
            </p>
          ) : (
            <div className="space-y-0.5">
              {sortedTags.map(([tag, count]) => {
                const isSelected = activeTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onSelectTag(isSelected ? null : tag);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-[var(--surface-hover)] hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Hash className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{tag}</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums opacity-70 ml-2">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quiet bottom count footer */}
      <div className="px-4 py-2.5 border-t border-[var(--surface-border)] text-[12px] text-slate-500 dark:text-slate-400 flex items-center justify-between tabular-nums">
        <span>{sortedCategories.length} categories</span>
        <span>{templatesInTab.length} templates</span>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop rail */}
      <div className="hidden lg:block h-full shrink-0">{sidebarContent}</div>

      {/* Mobile / narrow-window slide-over drawer (positioned below 82px titlebar + tab bar) */}
      {isMobileOpen && (
        <div className="app-no-drag lg:hidden fixed inset-x-0 top-[82px] bottom-0 z-40 flex">
          <div
            className="app-no-drag fixed inset-x-0 top-[82px] bottom-0 bg-black/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="app-no-drag relative z-10 h-full shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
