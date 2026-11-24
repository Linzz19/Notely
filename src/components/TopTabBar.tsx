import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  GripVertical,
  HelpCircle,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  AppUpdateState,
  DesktopPreferences,
  DesktopPreferencesPatch,
  DesktopSignInMode,
} from '../types/electron';
import { ThemeMode, ThemePreset, WorkspaceTab } from '../types/workspace';
import { AccountMenu, CloudSyncStatus } from './AccountMenu';
import { ThemeSettingsPopover } from './ThemeSettingsPopover';

interface TopTabBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  theme: ThemeMode;
  themePreset: ThemePreset;
  accentColor: string;
  isDesktopApp: boolean;
  desktopPrefs: DesktopPreferences;
  updateState: AppUpdateState;
  authUser: User | null;
  authLoading: boolean;
  authPendingMode: DesktopSignInMode | null;
  cloudSyncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
  cloudSyncError: string | null;
  encryptionEnabled: boolean;
  encryptionUnlocked: boolean;
  onSignInGoogle: (mode?: DesktopSignInMode) => void;
  onCancelSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onSyncNow: () => void;
  onOpenVaultSetup: () => void;
  onOpenVaultUnlock: () => void;
  onOpenVaultDisable: () => void;
  onSelectTab: (tabId: string) => void;
  onCreateTab: (name: string) => void;
  onRenameTab: (tabId: string, newName: string) => void;
  onDeleteTab: (tabId: string) => void;
  onReorderTabs: (orderedTabIds: string[]) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeThemePreset: (preset: ThemePreset) => void;
  onChangeAccentColor: (accentColor: string) => void;
  onResetTheme: () => void;
  onUpdateDesktopPrefs: (patch: DesktopPreferencesPatch) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
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
  themePreset,
  accentColor,
  isDesktopApp,
  desktopPrefs,
  updateState,
  authUser,
  authLoading,
  authPendingMode,
  cloudSyncStatus,
  lastSyncedAt,
  cloudSyncError,
  encryptionEnabled,
  encryptionUnlocked,
  onSignInGoogle,
  onCancelSignInGoogle,
  onSignOutGoogle,
  onSyncNow,
  onOpenVaultSetup,
  onOpenVaultUnlock,
  onOpenVaultDisable,
  onSelectTab,
  onCreateTab,
  onRenameTab,
  onDeleteTab,
  onReorderTabs,
  onChangeTheme,
  onChangeThemePreset,
  onChangeAccentColor,
  onResetTheme,
  onUpdateDesktopPrefs,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
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
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const navScrollRef = useRef<HTMLElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const tabElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<TabDragState | null>(null);
  dragStateRef.current = dragState;

  const updateScrollButtons = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    updateScrollButtons();

    const observer = new ResizeObserver(() => updateScrollButtons());
    observer.observe(el);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [tabs.length, confirmDeleteTabId, editingTabId, updateScrollButtons]);

  // Keep active tab scrolled into view when switching tabs or resizing
  useEffect(() => {
    const activeEl = tabElementsRef.current.get(activeTabId);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = window.setTimeout(updateScrollButtons, 180);
    return () => window.clearTimeout(timer);
  }, [activeTabId, updateScrollButtons]);

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

  const scrollTabsBy = (delta: number) => {
    const el = navScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleNavWheel = (e: React.WheelEvent<HTMLElement>) => {
    const el = navScrollRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      updateScrollButtons();
    }
  };

  const isWindowsDesktop = Boolean(
    window.fluentDesktop?.isElectron && window.fluentDesktop?.platform === 'win32'
  );

  return (
    <header className="shrink-0 bg-[var(--surface-frame)] border-b border-[var(--surface-border)] select-none flex flex-col">
      {/* Row 1: Dedicated 38px Window Titlebar (Notely left, Quick Jump dead-center, Windows caption buttons clear on right) */}
      <div
        className={`h-[38px] px-3 sm:px-4 grid items-center gap-2 border-b border-[var(--surface-border)]/60 ${
          isWindowsDesktop
            ? 'app-drag-region grid-cols-[minmax(144px,1fr)_auto_minmax(144px,1fr)]'
            : 'grid-cols-[minmax(68px,1fr)_auto_minmax(68px,1fr)]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 justify-self-start">
          <span className="font-display text-[13px] font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
            Notely
          </span>
        </div>

        {/* Centered Quick Jump Command Search Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="app-no-drag justify-self-center flex items-center justify-between gap-2 h-[26px] w-[190px] sm:w-[270px] md:w-[360px] px-2.5 rounded-md bg-[var(--surface-panel)]/90 hover:bg-[var(--surface-panel)] border border-[var(--surface-border)] hover:border-[var(--surface-border-strong)] text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          title="Quick Jump across all tabs (Ctrl+K)"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Search className="w-3.5 h-3.5 shrink-0 opacity-75" />
            <span className="truncate">Quick Jump</span>
          </span>
          <kbd className="hidden sm:inline-block font-mono text-[10px] leading-none px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-slate-500 dark:text-slate-400 border border-[var(--surface-border)] shrink-0">
            Ctrl K
          </kbd>
        </button>

        {/* Balanced right spacer (reserves 144px for Windows Minimize/Maximize/Close overlay) */}
        <div aria-hidden="true" className="h-full" />
      </div>

      {/* Row 2: Full-width Interactive Tab Strip + Right-aligned (+New Tab | Backup ? Settings Sign In) */}
      <div className="app-no-drag h-[44px] px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-3">
        {/* Zone 1: Narrow-window categories toggle */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Toggle categories and tags"
          title="Categories & Tags"
          className="app-no-drag lg:hidden p-1.5 -ml-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-[var(--surface-hover)] dark:text-slate-300 dark:hover:text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Zone 2: Horizontal Project Tabs */}
        <div className="flex-1 min-w-0 flex items-end h-full gap-1">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabsBy(-160)}
              aria-label="Scroll tabs left"
              title="Scroll tabs left"
              className="app-no-drag flex items-center justify-center w-6 h-[32px] mb-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-[var(--surface-hover)] dark:text-slate-400 dark:hover:text-slate-100 shrink-0 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          <nav
            ref={navScrollRef}
            aria-label="Project workspace tabs"
            onScroll={updateScrollButtons}
            onWheel={handleNavWheel}
            className="flex-1 min-w-0 flex items-end h-full overflow-x-auto overflow-y-hidden no-scrollbar gap-1 pt-1.5"
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
                  className="app-no-drag flex items-center h-[36px] px-2 bg-[var(--surface-panel)] border border-[var(--accent)] rounded-t-md shrink-0"
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
                    className="w-28 sm:w-32 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </form>
              );
            }

            if (isConfirmingDelete) {
              return (
                <div
                  key={tab.id}
                  className="app-no-drag flex items-center gap-1.5 h-[36px] px-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-t-md shrink-0"
                >
                  <span className="text-xs font-medium text-red-700 dark:text-red-300 whitespace-nowrap max-w-[110px] truncate">
                    Delete {tab.name}?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTab(tab.id);
                      setConfirmDeleteTabId(null);
                    }}
                    className="app-no-drag px-1.5 py-0.5 text-[11px] font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTabId(null)}
                    className="app-no-drag px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
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
                className={`app-no-drag group relative flex items-center gap-1 h-[36px] pl-1.5 pr-2 rounded-t-md border-t border-x shrink-0 max-w-[172px] ${
                  isThisDragged
                    ? 'z-30 shadow-md cursor-grabbing bg-[var(--surface-elevated)] border-[var(--accent)] text-slate-900 dark:text-slate-100'
                    : isActive
                      ? 'z-10 cursor-grab bg-[var(--surface-panel)] border-[var(--surface-border)] text-slate-900 dark:text-slate-100 transition-colors'
                      : 'cursor-grab bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-[var(--surface-hover)] dark:text-slate-400 dark:hover:text-slate-200 transition-colors'
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
                  className={`text-[13px] font-medium truncate focus-visible:outline-none ${
                    isThisDragged ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  title={`${tab.name} (drag to reorder, double-click to rename)`}
                >
                  {tab.name}
                </button>

                {/* Inline edit/delete actions */}
                <div
                  data-no-drag="true"
                  className={`app-no-drag flex items-center gap-0.5 shrink-0 transition-opacity ${
                    isActive
                      ? 'opacity-75 hover:opacity-100'
                      : 'opacity-0 group-hover:opacity-85'
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
                    className="app-no-drag p-0.5 rounded hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
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
                      className="app-no-drag p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Fluent active bottom accent indicator */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]"
                  />
                )}
              </div>
            );
          })}
        </nav>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollTabsBy(160)}
            aria-label="Scroll tabs right"
            title="Scroll tabs right"
            className="app-no-drag flex items-center justify-center w-6 h-[32px] mb-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-[var(--surface-hover)] dark:text-slate-400 dark:hover:text-slate-100 shrink-0 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Zone 3: +New Tab | Backup, Guide, Settings, and Sign In */}
      <div className="app-no-drag flex items-center gap-1 shrink-0">
        {isAddingTab ? (
          <form
            onSubmit={handleAddSubmit}
            className="app-no-drag flex items-center gap-1 h-8 px-2 bg-[var(--surface-panel)] border border-[var(--accent)] rounded-md shrink-0"
          >
            <input
              ref={addInputRef}
              type="text"
              placeholder="Tab name..."
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsAddingTab(false);
                  setNewTabName('');
                }
              }}
              maxLength={32}
              className="app-no-drag w-24 sm:w-28 bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Confirm new tab"
              title="Create tab"
              className="app-no-drag p-0.5 text-[var(--accent)] hover:bg-[var(--surface-hover)] rounded"
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
              title="Cancel"
              className="app-no-drag p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingTab(true)}
            className="app-no-drag flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-[var(--surface-panel)] border border-[var(--surface-border)] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[var(--surface-border-strong)] hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            title="Add project tab"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">New Tab</span>
          </button>
        )}

        {/* Vertical separator between +New Tab and right utility actions */}
        <span
          aria-hidden="true"
          className="h-4 w-px bg-[var(--surface-border-strong)] mx-1 shrink-0"
        />

        <button
          type="button"
          onClick={onOpenBackupModal}
          className="app-no-drag flex items-center gap-1.5 h-8 px-2 xl:px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          title="Export or import JSON workspace backup"
        >
          <DatabaseBackup className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Backup</span>
        </button>

        <button
          type="button"
          onClick={onOpenGuide}
          aria-label="Open user guide"
          title="User Guide & Shortcuts"
          className="app-no-drag flex items-center justify-center w-8 h-8 rounded-md text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Settings (Appearance, Desktop Behavior & App Updates — right of ?) */}
        <div className="relative">
          <button
            type="button"
            data-theme-settings-trigger="true"
            onClick={() => setIsThemeSettingsOpen((open) => !open)}
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={isThemeSettingsOpen}
            title={
              updateState.status === 'available' || updateState.status === 'downloaded'
                ? 'Settings (Update available)'
                : 'Settings'
            }
            className={`app-no-drag relative flex items-center justify-center w-8 h-8 rounded-md transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              isThemeSettingsOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]'
            }`}
          >
            <Settings className="w-4 h-4" />
            {(updateState.status === 'available' ||
              updateState.status === 'downloaded') && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface-frame)]"
              />
            )}
          </button>

          {isThemeSettingsOpen && (
            <ThemeSettingsPopover
              theme={theme}
              themePreset={themePreset}
              accentColor={accentColor}
              isDesktopApp={isDesktopApp}
              desktopPrefs={desktopPrefs}
              updateState={updateState}
              onChangeTheme={onChangeTheme}
              onChangeThemePreset={onChangeThemePreset}
              onChangeAccentColor={onChangeAccentColor}
              onResetTheme={onResetTheme}
              onUpdateDesktopPrefs={onUpdateDesktopPrefs}
              onCheckForUpdates={onCheckForUpdates}
              onDownloadUpdate={onDownloadUpdate}
              onInstallUpdate={onInstallUpdate}
              onClose={() => setIsThemeSettingsOpen(false)}
            />
          )}
        </div>

        {/* Google Account & Firebase Cloud Sync */}
        <AccountMenu
          user={authUser}
          authLoading={authLoading}
          authPendingMode={authPendingMode}
          isDesktopApp={isDesktopApp}
          syncStatus={cloudSyncStatus}
          lastSyncedAt={lastSyncedAt}
          syncError={cloudSyncError}
          encryptionEnabled={encryptionEnabled}
          encryptionUnlocked={encryptionUnlocked}
          onSignIn={onSignInGoogle}
          onCancelSignIn={onCancelSignInGoogle}
          onSignOut={onSignOutGoogle}
          onSyncNow={onSyncNow}
          onOpenVaultSetup={onOpenVaultSetup}
          onOpenVaultUnlock={onOpenVaultUnlock}
          onOpenVaultDisable={onOpenVaultDisable}
        />
        </div>
      </div>
    </header>
  );
};
