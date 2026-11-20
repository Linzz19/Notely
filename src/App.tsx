import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackupModal } from './components/BackupModal';
import { CategorySidebar } from './components/CategorySidebar';
import { CommandPalette } from './components/CommandPalette';
import { GuideModal } from './components/GuideModal';
import { QuickFillModal } from './components/QuickFillModal';
import { TemplateInspector } from './components/TemplateInspector';
import { TemplateListPane } from './components/TemplateListPane';
import { ToastContainer } from './components/ToastContainer';
import { TopTabBar } from './components/TopTabBar';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { createStarterWorkspace } from './data/starterWorkspace';
import {
  CopyFormat,
  InspectorViewMode,
  SnippetTemplate,
  SortOption,
  TemplateCategory,
  TemplateVersion,
  ToastMessage,
  WorkspaceData,
  WorkspaceTab,
} from './types/workspace';
import {
  loadDesktopWorkspace,
  loadWorkspace,
  ParsedBackupResult,
  saveWorkspace,
} from './utils/storage';
import { copyTemplateToClipboard, extractVariables } from './utils/templateEngine';

const MAX_HISTORY_VERSIONS = 3;
const EDIT_BURST_IDLE_MS = 3500;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => loadWorkspace());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => {
    const initial = loadWorkspace();
    const firstInTab = initial.templates.find((t) => t.tabId === initial.activeTabId);
    return firstInTab?.id ?? null;
  });
  const [inspectorMode, setInspectorMode] = useState<InspectorViewMode>('preview');
  const [mobilePane, setMobilePane] = useState<'list' | 'inspector'>('list');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [quickFillTarget, setQuickFillTarget] = useState<{
    template: SnippetTemplate;
    format: CopyFormat;
  } | null>(null);

  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [copiedInspectorFormat, setCopiedInspectorFormat] =
    useState<CopyFormat | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const desktopHydratedRef = useRef(!window.fluentDesktop?.isElectron);
  const editBurstRef = useRef<{ templateId: string; lastEditAt: number } | null>(
    null
  );

  // Hydrate workspace from %APPDATA%\Notely\workspace.json when running as Windows .exe
  useEffect(() => {
    if (!window.fluentDesktop?.isElectron) return;
    let cancelled = false;

    void loadDesktopWorkspace().then((diskData) => {
      if (cancelled) return;
      if (diskData) {
        setWorkspace(diskData);
        const firstInTab = diskData.templates.find(
          (t) => t.tabId === diskData.activeTabId
        );
        setSelectedTemplateId(firstInTab?.id ?? null);
      }
      desktopHydratedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for Windows System Tray / global Ctrl+Shift+Space Quick Jump triggers
  useEffect(() => {
    if (!window.fluentDesktop?.onOpenQuickJump) return;
    return window.fluentDesktop.onOpenQuickJump(() => {
      setIsCommandPaletteOpen(true);
    });
  }, []);

  // Persist workspace to AppData (Electron) and localStorage
  useEffect(() => {
    if (!desktopHydratedRef.current) return;
    saveWorkspace(workspace);
  }, [workspace]);

  // Sync Tailwind v4 .dark class on <html> and Windows 11 titlebar overlay color
  useEffect(() => {
    const root = document.documentElement;
    if (workspace.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (window.fluentDesktop?.syncTheme) {
      void window.fluentDesktop.syncTheme(workspace.theme);
    }
  }, [workspace.theme]);

  const pushToast = useCallback(
    (
      message: string,
      variant: ToastMessage['variant'] = 'success',
      detail?: string
    ) => {
      const id = createId('toast');
      setToasts((prev) => [...prev.slice(-2), { id, message, detail, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
    },
    []
  );

  // Derived active tab, categories, and templates
  const activeTab = useMemo(
    () =>
      workspace.tabs.find((t) => t.id === workspace.activeTabId) ||
      workspace.tabs[0],
    [workspace.tabs, workspace.activeTabId]
  );

  const categoriesInTab = useMemo(
    () =>
      workspace.categories
        .filter((c) => c.tabId === activeTab?.id)
        .sort((a, b) => a.order - b.order),
    [workspace.categories, activeTab?.id]
  );

  const templatesInTab = useMemo(
    () => workspace.templates.filter((t) => t.tabId === activeTab?.id),
    [workspace.templates, activeTab?.id]
  );

  const filteredTemplates = useMemo(() => {
    const validCatIds = new Set(categoriesInTab.map((c) => c.id));
    const catNameMap = new Map(categoriesInTab.map((c) => [c.id, c.name]));
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searchTokens = normalizedSearch.split(/\s+/).filter(Boolean);

    const matching = templatesInTab.filter((tpl) => {
      // Category filter
      if (workspace.activeCategoryId === 'uncategorized') {
        if (tpl.categoryId && validCatIds.has(tpl.categoryId)) return false;
      } else if (workspace.activeCategoryId !== 'all') {
        if (tpl.categoryId !== workspace.activeCategoryId) return false;
      }

      // Tag filter
      if (workspace.activeTag) {
        const hasTag = tpl.tags.some(
          (t) => t.toLowerCase() === workspace.activeTag?.toLowerCase()
        );
        if (!hasTag) return false;
      }

      // Search filter across title, content, tags, and category name
      if (searchTokens.length > 0) {
        const catName = (catNameMap.get(tpl.categoryId) || '').toLowerCase();
        const haystack = [
          tpl.title.toLowerCase(),
          tpl.content.toLowerCase(),
          tpl.tags.map((t) => `#${t.toLowerCase()}`).join(' '),
          catName,
        ].join('\n');

        for (const token of searchTokens) {
          if (!haystack.includes(token)) return false;
        }
      }

      return true;
    });

    return [...matching].sort((a, b) => {
      if (workspace.sortBy === 'usage') {
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      if (workspace.sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [
    templatesInTab,
    categoriesInTab,
    workspace.activeCategoryId,
    workspace.activeTag,
    workspace.sortBy,
    searchQuery,
  ]);

  const selectedTemplate = useMemo(
    () =>
      workspace.templates.find((t) => t.id === selectedTemplateId) || null,
    [workspace.templates, selectedTemplateId]
  );

  // Keep selected template aligned when switching tabs or deleting
  useEffect(() => {
    if (
      selectedTemplate &&
      selectedTemplate.tabId === activeTab?.id
    ) {
      return;
    }
    setSelectedTemplateId(filteredTemplates[0]?.id ?? null);
  }, [activeTab?.id, selectedTemplate, filteredTemplates]);

  // Execute actual copy + usage tracking
  const performCopy = useCallback(
    async (template: SnippetTemplate, textToCopy: string, format: CopyFormat) => {
      const result = await copyTemplateToClipboard(textToCopy, format);
      if (!result.success) {
        pushToast('Clipboard access blocked', 'error', 'Copy manually from the editor.');
        return;
      }

      const now = new Date().toISOString();
      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          t.id === template.id
            ? { ...t, usageCount: t.usageCount + 1, lastCopiedAt: now }
            : t
        ),
      }));

      setCopiedRowId(template.id);
      setCopiedInspectorFormat(result.actualFormat);
      window.setTimeout(() => {
        setCopiedRowId((curr) => (curr === template.id ? null : curr));
        setCopiedInspectorFormat((curr) =>
          curr === result.actualFormat ? null : curr
        );
      }, 1500);

      const labelMap: Record<CopyFormat, string> = {
        rich: 'Copied formatted template',
        plain: 'Copied plain text',
        markdown: 'Copied raw Markdown',
      };
      const detailMap: Record<CopyFormat, string> = {
        rich: 'Ready to paste into Outlook, Gmail, Teams, or Docs.',
        plain: 'Formatting stripped for plain-text inputs.',
        markdown: 'Original Markdown syntax preserved.',
      };
      pushToast(labelMap[result.actualFormat], 'success', detailMap[result.actualFormat]);
    },
    [pushToast]
  );

  const handleRequestCopy = useCallback(
    (template: SnippetTemplate, format: CopyFormat = 'rich') => {
      const vars = extractVariables(template.content);
      if (vars.length > 0 && format !== 'markdown') {
        setQuickFillTarget({ template, format });
        return;
      }
      void performCopy(template, template.content, format);
    },
    [performCopy]
  );

  // Tab handlers
  const handleSelectTab = useCallback(
    (tabId: string) => {
      setWorkspace((prev) => ({
        ...prev,
        activeTabId: tabId,
        activeCategoryId: 'all',
        activeTag: null,
      }));
      setSearchQuery('');
      const firstInNewTab = workspace.templates.find((t) => t.tabId === tabId);
      setSelectedTemplateId(firstInNewTab?.id ?? null);
      setMobilePane('list');
    },
    [workspace.templates]
  );

  const handleCreateTab = useCallback(
    (name: string) => {
      const now = new Date().toISOString();
      const newTabId = createId('tab');
      const defaultCatId = createId('cat');

      const newTab: WorkspaceTab = {
        id: newTabId,
        name,
        order: workspace.tabs.length,
        createdAt: now,
      };
      const defaultCat: TemplateCategory = {
        id: defaultCatId,
        tabId: newTabId,
        name: 'General',
        order: 0,
      };

      setWorkspace((prev) => ({
        ...prev,
        tabs: [...prev.tabs, newTab],
        categories: [...prev.categories, defaultCat],
        activeTabId: newTabId,
        activeCategoryId: 'all',
        activeTag: null,
      }));
      setSelectedTemplateId(null);
      pushToast(`Created tab "${name}"`, 'info');
    },
    [workspace.tabs.length, pushToast]
  );

  const handleRenameTab = useCallback((tabId: string, newName: string) => {
    setWorkspace((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, name: newName } : t)),
    }));
  }, []);

  const handleDeleteTab = useCallback(
    (tabId: string) => {
      setWorkspace((prev) => {
        if (prev.tabs.length <= 1) return prev;
        const remainingTabs = prev.tabs.filter((t) => t.id !== tabId);
        const nextActiveTabId =
          prev.activeTabId === tabId ? remainingTabs[0].id : prev.activeTabId;

        return {
          ...prev,
          tabs: remainingTabs,
          categories: prev.categories.filter((c) => c.tabId !== tabId),
          templates: prev.templates.filter((t) => t.tabId !== tabId),
          activeTabId: nextActiveTabId,
          activeCategoryId: prev.activeTabId === tabId ? 'all' : prev.activeCategoryId,
          activeTag: prev.activeTabId === tabId ? null : prev.activeTag,
        };
      });
      pushToast('Tab deleted', 'info');
    },
    [pushToast]
  );

  const handleReorderTabs = useCallback((orderedTabIds: string[]) => {
    const orderMap = new Map(orderedTabIds.map((id, index) => [id, index]));
    setWorkspace((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        orderMap.has(tab.id) ? { ...tab, order: orderMap.get(tab.id)! } : tab
      ),
    }));
  }, []);

  // Category handlers
  const handleCreateCategory = useCallback(
    (name: string): string => {
      const newCatId = createId('cat');
      const targetTabId = activeTab?.id || workspace.tabs[0]?.id;
      if (!targetTabId) return '';

      setWorkspace((prev) => ({
        ...prev,
        categories: [
          ...prev.categories,
          {
            id: newCatId,
            tabId: targetTabId,
            name,
            order: prev.categories.filter((c) => c.tabId === targetTabId).length,
          },
        ],
      }));
      return newCatId;
    },
    [activeTab?.id, workspace.tabs]
  );

  const handleRenameCategory = useCallback((catId: string, newName: string) => {
    setWorkspace((prev) => ({
      ...prev,
      categories: prev.categories.map((c) =>
        c.id === catId ? { ...c, name: newName } : c
      ),
    }));
  }, []);

  const handleDeleteCategory = useCallback((catId: string) => {
    setWorkspace((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== catId),
      templates: prev.templates.map((t) =>
        t.categoryId === catId ? { ...t, categoryId: '' } : t
      ),
      activeCategoryId:
        prev.activeCategoryId === catId ? 'all' : prev.activeCategoryId,
    }));
  }, []);

  const handleReorderCategories = useCallback((orderedCategoryIds: string[]) => {
    const orderMap = new Map(orderedCategoryIds.map((id, index) => [id, index]));
    setWorkspace((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        orderMap.has(cat.id) ? { ...cat, order: orderMap.get(cat.id)! } : cat
      ),
    }));
  }, []);

  // Template handlers
  const handleCreateTemplate = useCallback(() => {
    if (!activeTab) return;
    const now = new Date().toISOString();
    const targetCategoryId =
      workspace.activeCategoryId !== 'all' &&
      workspace.activeCategoryId !== 'uncategorized'
        ? workspace.activeCategoryId
        : categoriesInTab[0]?.id ?? '';

    const newTpl: SnippetTemplate = {
      id: createId('tpl'),
      tabId: activeTab.id,
      categoryId: targetCategoryId,
      title: 'Untitled Template',
      content: '',
      tags: workspace.activeTag ? [workspace.activeTag] : [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      lastCopiedAt: null,
    };

    setWorkspace((prev) => ({
      ...prev,
      templates: [newTpl, ...prev.templates],
    }));
    setSelectedTemplateId(newTpl.id);
    setInspectorMode('edit');
    setMobilePane('inspector');
  }, [activeTab, workspace.activeCategoryId, workspace.activeTag, categoriesInTab]);

  const handleEndEditBurst = useCallback(() => {
    editBurstRef.current = null;
  }, []);

  const handleUpdateTemplate = useCallback(
    (
      templateId: string,
      patch: Partial<Pick<SnippetTemplate, 'title' | 'content' | 'categoryId' | 'tags'>>
    ) => {
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();

      let shouldSnapshot = false;
      if (patch.content !== undefined) {
        const lastBurst = editBurstRef.current;
        if (
          !lastBurst ||
          lastBurst.templateId !== templateId ||
          nowMs - lastBurst.lastEditAt > EDIT_BURST_IDLE_MS
        ) {
          shouldSnapshot = true;
        }
        editBurstRef.current = { templateId, lastEditAt: nowMs };
      }

      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) => {
          if (t.id !== templateId) return t;

          let nextHistory = t.history ?? [];
          if (
            shouldSnapshot &&
            patch.content !== undefined &&
            patch.content !== t.content &&
            t.content.trim().length > 0 &&
            nextHistory[0]?.content !== t.content
          ) {
            const snapshot: TemplateVersion = {
              id: createId('ver'),
              content: t.content,
              savedAt: now,
            };
            nextHistory = [snapshot, ...nextHistory].slice(0, MAX_HISTORY_VERSIONS);
          }

          return {
            ...t,
            ...patch,
            history: nextHistory,
            updatedAt: now,
          };
        }),
      }));
    },
    []
  );

  const handleRestoreTemplateVersion = useCallback(
    (templateId: string, version: TemplateVersion) => {
      const now = new Date().toISOString();
      editBurstRef.current = null;

      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) => {
          if (t.id !== templateId) return t;
          const existingHistory = t.history ?? [];
          const remaining = existingHistory.filter((v) => v.id !== version.id);
          const nextHistory =
            t.content.trim().length > 0 && t.content !== version.content
              ? [
                  {
                    id: createId('ver'),
                    content: t.content,
                    savedAt: now,
                  },
                  ...remaining,
                ].slice(0, MAX_HISTORY_VERSIONS)
              : existingHistory;

          return {
            ...t,
            content: version.content,
            history: nextHistory,
            updatedAt: now,
          };
        }),
      }));

      pushToast(
        'Restored previous version',
        'success',
        'Your prior draft was also saved into version history.'
      );
    },
    [pushToast]
  );

  const handleDuplicateTemplate = useCallback(
    (template: SnippetTemplate) => {
      const now = new Date().toISOString();
      const copy: SnippetTemplate = {
        ...template,
        id: createId('tpl'),
        title: `${template.title} (Copy)`,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        history: [],
      };
      setWorkspace((prev) => ({
        ...prev,
        templates: [copy, ...prev.templates],
      }));
      setSelectedTemplateId(copy.id);
      pushToast('Template duplicated', 'info');
    },
    [pushToast]
  );

  const handleDeleteTemplate = useCallback(
    (templateId: string) => {
      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.filter((t) => t.id !== templateId),
      }));
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
        setMobilePane('list');
      }
      pushToast('Template deleted', 'info');
    },
    [selectedTemplateId, pushToast]
  );

  // Backup handlers
  const handleImportReplace = useCallback(
    (parsed: ParsedBackupResult) => {
      const firstTabId = parsed.tabs[0]?.id ?? '';
      const firstTplId =
        parsed.templates.find((t) => t.tabId === firstTabId)?.id ?? null;

      setWorkspace((prev) => ({
        ...prev,
        tabs: parsed.tabs,
        categories: parsed.categories,
        templates: parsed.templates,
        activeTabId: firstTabId,
        activeCategoryId: 'all',
        activeTag: null,
      }));
      setSelectedTemplateId(firstTplId);
      setSearchQuery('');
      pushToast('Workspace restored from backup', 'success');
    },
    [pushToast]
  );

  const handleImportMerge = useCallback(
    (parsed: ParsedBackupResult) => {
      const tabIdMap = new Map<string, string>();
      const catIdMap = new Map<string, string>();

      const newTabs: WorkspaceTab[] = parsed.tabs.map((t, i) => {
        const freshId = createId('tab');
        tabIdMap.set(t.id, freshId);
        return {
          ...t,
          id: freshId,
          order: workspace.tabs.length + i,
        };
      });

      const newCategories: TemplateCategory[] = parsed.categories.map((c) => {
        const freshId = createId('cat');
        catIdMap.set(c.id, freshId);
        return {
          ...c,
          id: freshId,
          tabId: tabIdMap.get(c.tabId) || newTabs[0].id,
        };
      });

      const newTemplates: SnippetTemplate[] = parsed.templates.map((tpl) => ({
        ...tpl,
        id: createId('tpl'),
        tabId: tabIdMap.get(tpl.tabId) || newTabs[0].id,
        categoryId: catIdMap.get(tpl.categoryId) || '',
      }));

      setWorkspace((prev) => ({
        ...prev,
        tabs: [...prev.tabs, ...newTabs],
        categories: [...prev.categories, ...newCategories],
        templates: [...prev.templates, ...newTemplates],
        activeTabId: newTabs[0]?.id || prev.activeTabId,
        activeCategoryId: 'all',
        activeTag: null,
      }));
      pushToast(
        `Merged ${newTabs.length} tab(s) & ${newTemplates.length} template(s)`,
        'success'
      );
    },
    [workspace.tabs.length, pushToast]
  );

  const handleResetStarter = useCallback(() => {
    const starter = createStarterWorkspace();
    setWorkspace((prev) => ({
      ...starter,
      theme: prev.theme,
    }));
    setSelectedTemplateId(starter.templates[0]?.id ?? null);
    setSearchQuery('');
    pushToast('Restored starter workspace', 'info');
  }, [pushToast]);

  // Global keyboard shortcuts (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const activeCategoryLabel = useMemo(() => {
    if (workspace.activeCategoryId === 'all') return 'All Templates';
    if (workspace.activeCategoryId === 'uncategorized') return 'Unassigned';
    return (
      categoriesInTab.find((c) => c.id === workspace.activeCategoryId)?.name ||
      'All Templates'
    );
  }, [workspace.activeCategoryId, categoriesInTab]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#F3F4F6] dark:bg-[#161618] text-slate-900 dark:text-slate-100">
      {/* Top Window Bar & Project Tab Strip */}
      <TopTabBar
        tabs={workspace.tabs}
        activeTabId={activeTab?.id ?? ''}
        theme={workspace.theme}
        onSelectTab={handleSelectTab}
        onCreateTab={handleCreateTab}
        onRenameTab={handleRenameTab}
        onDeleteTab={handleDeleteTab}
        onReorderTabs={handleReorderTabs}
        onToggleTheme={() =>
          setWorkspace((prev) => ({
            ...prev,
            theme: prev.theme === 'light' ? 'dark' : 'light',
          }))
        }
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenGuide={() => setIsGuideModalOpen(true)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((v) => !v)}
      />

      {/* Three-Pane Fluent Workspace Shell */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <CategorySidebar
          activeTabName={activeTab?.name ?? 'Workspace'}
          categories={categoriesInTab}
          templatesInTab={templatesInTab}
          activeCategoryId={workspace.activeCategoryId}
          activeTag={workspace.activeTag}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          onSelectCategory={(catId) =>
            setWorkspace((prev) => ({ ...prev, activeCategoryId: catId }))
          }
          onSelectTag={(tag) =>
            setWorkspace((prev) => ({ ...prev, activeTag: tag }))
          }
          onCreateCategory={handleCreateCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onReorderCategories={handleReorderCategories}
        />

        {/* Template List Pane (always visible on md+, toggled on mobile) */}
        <div
          className={`${
            mobilePane === 'list' ? 'flex' : 'hidden md:flex'
          } h-full w-full md:w-auto shrink-0`}
        >
          <TemplateListPane
            templates={filteredTemplates}
            categories={categoriesInTab}
            selectedTemplateId={selectedTemplate?.id ?? null}
            copiedTemplateId={copiedRowId}
            searchQuery={searchQuery}
            activeCategoryLabel={activeCategoryLabel}
            activeTag={workspace.activeTag}
            sortBy={workspace.sortBy}
            onSearchChange={setSearchQuery}
            onSortChange={(sortBy: SortOption) =>
              setWorkspace((prev) => ({ ...prev, sortBy }))
            }
            onClearFilters={() => {
              setSearchQuery('');
              setWorkspace((prev) => ({
                ...prev,
                activeCategoryId: 'all',
                activeTag: null,
              }));
            }}
            onSelectTemplate={(id) => {
              editBurstRef.current = null;
              setSelectedTemplateId(id);
              setMobilePane('inspector');
            }}
            onQuickCopyTemplate={(tpl) => handleRequestCopy(tpl, 'rich')}
            onCreateTemplate={handleCreateTemplate}
          />
        </div>

        {/* Template Preview / Editor Pane */}
        <div
          className={`${
            mobilePane === 'inspector' ? 'flex' : 'hidden md:flex'
          } flex-1 min-w-0 h-full`}
        >
          <TemplateInspector
            template={selectedTemplate}
            tabName={activeTab?.name ?? 'Workspace'}
            categories={categoriesInTab}
            viewMode={inspectorMode}
            copiedFormat={copiedInspectorFormat}
            onChangeViewMode={setInspectorMode}
            onUpdateTemplate={handleUpdateTemplate}
            onDuplicateTemplate={handleDuplicateTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onCopyTemplate={handleRequestCopy}
            onCreateCategoryInline={handleCreateCategory}
            onCreateTemplate={handleCreateTemplate}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenHistory={() => setIsHistoryModalOpen(true)}
            onEditorBlur={handleEndEditBurst}
            onBackToListMobile={() => setMobilePane('list')}
          />
        </div>
      </div>

      {/* Quick-Fill Variable Modal */}
      {quickFillTarget && (
        <QuickFillModal
          template={quickFillTarget.template}
          requestedFormat={quickFillTarget.format}
          onClose={() => setQuickFillTarget(null)}
          onConfirmCopy={(filledContent, format) => {
            const target = quickFillTarget.template;
            setQuickFillTarget(null);
            void performCopy(target, filledContent, format);
          }}
        />
      )}

      {/* Global Ctrl+K Command Palette */}
      {isCommandPaletteOpen && (
        <CommandPalette
          tabs={workspace.tabs}
          categories={workspace.categories}
          templates={workspace.templates}
          theme={workspace.theme}
          onClose={() => setIsCommandPaletteOpen(false)}
          onCopyTemplate={(tpl) => handleRequestCopy(tpl, 'rich')}
          onJumpToTemplate={(tpl) => {
            setWorkspace((prev) => ({
              ...prev,
              activeTabId: tpl.tabId,
              activeCategoryId: tpl.categoryId || 'all',
              activeTag: null,
            }));
            setSelectedTemplateId(tpl.id);
            setMobilePane('inspector');
          }}
          onSelectTab={handleSelectTab}
          onCreateTemplate={handleCreateTemplate}
          onToggleTheme={() =>
            setWorkspace((prev) => ({
              ...prev,
              theme: prev.theme === 'light' ? 'dark' : 'light',
            }))
          }
          onOpenBackup={() => setIsBackupModalOpen(true)}
          onOpenGuide={() => setIsGuideModalOpen(true)}
        />
      )}

      {/* JSON Backup Export/Import Modal */}
      {isBackupModalOpen && (
        <BackupModal
          workspace={workspace}
          onClose={() => setIsBackupModalOpen(false)}
          onImportReplace={handleImportReplace}
          onImportMerge={handleImportMerge}
          onResetStarter={handleResetStarter}
        />
      )}

      {/* User Guide & Feature Reference Modal */}
      {isGuideModalOpen && (
        <GuideModal onClose={() => setIsGuideModalOpen(false)} />
      )}

      {/* Template Local Version History Modal (Last 3 Edits) */}
      {isHistoryModalOpen && selectedTemplate && (
        <VersionHistoryModal
          template={selectedTemplate}
          onClose={() => setIsHistoryModalOpen(false)}
          onRestoreVersion={(version) =>
            handleRestoreTemplateVersion(selectedTemplate.id, version)
          }
        />
      )}

      {/* Toast Feedback */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
      />
    </div>
  );
}
