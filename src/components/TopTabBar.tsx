import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  DatabaseBackup,
  GripVertical,
  HelpCircle,
  Menu,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { ThemeMode, WorkspaceTab } from '../types/workspace';

interface TopTabBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  theme: ThemeMode;
  onSelectTab: (tabId: string) => void;
  onCreateTab: (name: string) => void;
  onRenameTab: (tabId: string, newName: string) => void;
  onDeleteTab: (tabId: string) => void;
  onReorderTabs: (orderedTabIds: string[]) => void;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenBackupModal: () => void;
  onOpenGuide: () => void;
  onToggleMobileSidebar: () => void;
}

interface TabRectSnapshot {
  id: string;
  width: number;
  centerX: number;
}

interface TabDragState {
  tabId: string;
  startIdx: number;
  targetIdx: number;
  startX: number;
  deltaX: number;
  isDragging: boolean;
  isReturning: boolean;
  snapshots: TabRectSnapshot[];
  gap: number;
}

const DRAG_THRESHOLD_PX = 5;

export const TopTabBar: React.FC<TopTabBarProps> = ({
  tabs,
  activeTabId,
  theme,
  onSelectTab,
  onCreateTab,
  onRenameTab,
  onDeleteTab,
  onReorderTabs,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenBackupModal,
  onOpenGuide,
  onToggleMobileSidebar,
}) => {
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteTabId, setConfirmDeleteTabId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<TabDragState | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const tabElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<TabDragState | null>(null);
  dragStateRef.current = dragState;

  useEffect(() => {
    if (isAddingTab) {
      addInputRef.current?.focus();
    }
  }, [isAddingTab]);

  useEffect(() => {
    if (editingTabId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingTabId]);

  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);
  const sortedTabsRef = useRef(sortedTabs);
  sortedTabsRef.current = sortedTabs;

  // Manage smooth pointer drag lifecycle across window
  useEffect(() => {
    if (!dragState || dragState.isReturning) return;

    if (dragState.isDragging) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    const handlePointerMove = (e: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || current.isReturning) return;

      const deltaX = e.clientX - current.startX;
      const absDelta = Math.abs(deltaX);

      if (!current.isDragging && absDelta < DRAG_THRESHOLD_PX) {
        return;
      }

      const startSnap = current.snapshots[current.startIdx];
      if (!startSnap) return;

      const currentCenterX = startSnap.centerX + deltaX;
      let leftCrossings = 0;
      let rightCrossings = 0;

      for (let i = 0; i < current.snapshots.length; i++) {
        if (i < current.startIdx && currentCenterX < current.snapshots[i].centerX) {
          leftCrossings++;
        } else if (i > current.startIdx && currentCenterX > current.snapshots[i].centerX) {
          rightCrossings++;
        }
      }

      const nextTargetIdx = current.startIdx - leftCrossings + rightCrossings;

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              isDragging: true,
              deltaX,
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
        onReorderTabs(ids);
        setDragState(null);
      } else {
        // Did not drag far enough to realign: smoothly glide back to original spot
        setDragState((prev) =>
          prev ? { ...prev, isReturning: true, deltaX: 0 } : null
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
  }, [dragState?.tabId, dragState?.isDragging, dragState?.isReturning, onReorderTabs]);

  const startTabPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    tabId: string,
    index: number
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (editingTabId || confirmDeleteTabId) return;

    const currentTabs = sortedTabsRef.current;
    const snapshots: TabRectSnapshot[] = currentTabs.map((t) => {
      const el = tabElementsRef.current.get(t.id);
      const rect = el?.getBoundingClientRect();
      return {
        id: t.id,
        width: rect?.width ?? 120,
        centerX: rect ? rect.left + rect.width / 2 : 0,
      };
    });

    let gap = 4;
    if (currentTabs.length > 1) {
      const firstEl = tabElementsRef.current.get(currentTabs[0].id);
      const secondEl = tabElementsRef.current.get(currentTabs[1].id);
      if (firstEl && secondEl) {
        gap = Math.max(
          0,
          secondEl.getBoundingClientRect().left - firstEl.getBoundingClientRect().right
        );
      }
    }

    setDragState({
      tabId,
      startIdx: index,
      targetIdx: index,
      startX: e.clientX,
      deltaX: 0,
      isDragging: false,
      isReturning: false,
      snapshots,
      gap,
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTabName.trim();
    if (trimmed) {
      onCreateTab(trimmed);
    }
    setNewTabName('');
    setIsAddingTab(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTabId && editingName.trim()) {
      onRenameTab(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
    setEditingName('');
  };

  const isWindowsDesktop = Boolean(
    window.fluentDesktop?.isElectron && window.fluentDesktop?.platform === 'win32'
  );

  return (
    <header
      className={`h-[52px] shrink-0 bg-[#F3F4F6] dark:bg-[#161618] border-b border-slate-200 dark:border-[#2E2E32] pl-3 sm:pl-4 flex items-center justify-between gap-4 select-none ${
        isWindowsDesktop ? 'app-drag-region pr-[144px]' : 'pr-3 sm:pr-4'
      }`}
    >
      {/* Zone 1: Mobile sidebar toggle + Single-line brand wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Toggle categories panel"
          className="app-no-drag lg:hidden p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
        >
          <Menu className="w-4 h-4" />
        </button>
        <span className="font-display text-[15px] font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          Notely
        </span>
      </div>

      {/* Zone 2: Horizontal Project Tabs (Tab > Category > Template) */}
      <nav
        aria-label="Project workspace tabs"
        className="flex-1 min-w-0 flex items-end h-full overflow-x-auto overflow-y-hidden gap-1 pt-2"
      >
        {sortedTabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;
          const isConfirmingDelete = confirmDeleteTabId === tab.id;

          if (isEditing) {
            return (
              <form
                key={tab.id}
                onSubmit={handleEditSubmit}
                className="flex items-center h-[36px] px-2 bg-white dark:bg-[#202023] border border-[#0067C0] dark:border-[#4CC2FF] rounded-t-md shrink-0"
              >
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleEditSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditingTabId(null);
                      setEditingName('');
                    }
                  }}
                  maxLength={32}
                  className="w-32 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </form>
            );
          }

          if (isConfirmingDelete) {
            return (
              <div
                key={tab.id}
                className="flex items-center gap-1.5 h-[36px] px-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-t-md shrink-0"
              >
                <span className="text-xs font-medium text-red-700 dark:text-red-300 whitespace-nowrap">
                  Delete {tab.name}?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTab(tab.id);
                    setConfirmDeleteTabId(null);
                  }}
                  className="px-1.5 py-0.5 text-[11px] font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTabId(null)}
                  className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            );
          }

          // Compute live horizontal transform during active pointer drag
          let translateX = 0;
          const isThisDragged =
            dragState?.isDragging && dragState.tabId === tab.id;

          if (dragState?.isDragging) {
            if (isThisDragged) {
              translateX = dragState.deltaX;
            } else {
              const draggedWidth =
                dragState.snapshots[dragState.startIdx]?.width ?? 120;
              const shift = draggedWidth + dragState.gap;
              if (
                dragState.startIdx < dragState.targetIdx &&
                index > dragState.startIdx &&
                index <= dragState.targetIdx
              ) {
                translateX = -shift;
              } else if (
                dragState.startIdx > dragState.targetIdx &&
                index < dragState.startIdx &&
                index >= dragState.targetIdx
              ) {
                translateX = shift;
              }
            }
          }

          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) {
                  tabElementsRef.current.set(tab.id, el);
                } else {
                  tabElementsRef.current.delete(tab.id);
                }
              }}
              onPointerDown={(e) => startTabPointerDown(e, tab.id, index)}
              style={{
                transform:
                  translateX !== 0
                    ? `translate3d(${translateX}px, 0, 0)`
                    : undefined,
                transition:
                  isThisDragged && !dragState?.isReturning
                    ? 'none'
                    : dragState?.isDragging
                    ? 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1)'
                    : undefined,
              }}
              className={`app-no-drag group relative flex items-center gap-1.5 h-[36px] pl-2 pr-3 rounded-t-md border-t border-x shrink-0 ${
                isThisDragged
                  ? 'z-30 shadow-md cursor-grabbing bg-white dark:bg-[#26262A] border-[#0067C0]/60 dark:border-[#4CC2FF]/60 text-slate-900 dark:text-slate-100'
                  : isActive
                  ? 'z-10 cursor-grab bg-white dark:bg-[#202023] border-slate-200 dark:border-[#2E2E32] text-slate-900 dark:text-slate-100 transition-colors'
                  : 'cursor-grab bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5 transition-colors'
              }`}
            >
              <GripVertical className="w-3 h-3 text-slate-400/70 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mr-0.5 pointer-events-none" />

              <button
                type="button"
                onClick={() => {
                  if (suppressClickRef.current) return;
                  onSelectTab(tab.id);
                }}
                onDoubleClick={() => {
                  setEditingTabId(tab.id);
                  setEditingName(tab.name);
                }}
                className={`text-[13px] font-medium whitespace-nowrap shrink-0 focus-visible:outline-none ${
                  isThisDragged ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                title={`${tab.name} (drag to reorder, double-click to rename)`}
              >
                {tab.name}
              </button>

              {/* Inline edit/close actions */}
              <div
                data-no-drag="true"
                className={`flex items-center gap-0.5 transition-opacity ${
                  isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-80'
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTabId(tab.id);
                    setEditingName(tab.name);
                  }}
                  aria-label={`Rename ${tab.name}`}
                  title="Rename tab"
                  className="p-0.5 rounded hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteTabId(tab.id);
                    }}
                    aria-label={`Delete ${tab.name}`}
                    title="Delete tab"
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Fluent active bottom accent indicator */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[#0067C0] dark:bg-[#4CC2FF]"
                />
              )}
            </div>
          );
        })}

        {isAddingTab ? (
          <form
            onSubmit={handleAddSubmit}
            className="flex items-center gap-1 h-[34px] px-2 mb-[1px] bg-white dark:bg-[#202023] border border-[#0067C0] dark:border-[#4CC2FF] rounded-md shrink-0"
          >
            <input
              ref={addInputRef}
              type="text"
              placeholder="Project tab name..."
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsAddingTab(false);
                  setNewTabName('');
                }
              }}
              maxLength={32}
              className="w-32 bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Confirm new tab"
              className="p-0.5 text-[#0067C0] dark:text-[#4CC2FF] hover:bg-slate-100 dark:hover:bg-white/10 rounded"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingTab(false);
                setNewTabName('');
              }}
              aria-label="Cancel new tab"
              className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingTab(true)}
            className="app-no-drag flex items-center gap-1 h-[32px] px-2.5 mb-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
            title="Add project tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Tab</span>
          </button>
        )}
      </nav>

      {/* Zone 3: Compact utility controls */}
      <div className="app-no-drag flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 h-8 px-2.5 rounded-md bg-white dark:bg-[#202023] border border-slate-200 dark:border-[#2E2E32] text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
          title="Open quick command palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Quick Jump</span>
          <kbd className="hidden md:inline-block font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#2C2C30] text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-[#3A3A3F]">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenBackupModal}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
          title="Export or import JSON workspace backup"
        >
          <DatabaseBackup className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Backup</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenGuide}
          aria-label="Open user guide"
          title="User Guide & Shortcuts"
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-[#0067C0] dark:hover:text-[#4CC2FF] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
