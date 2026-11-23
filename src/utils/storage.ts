import { createStarterWorkspace } from '../data/starterWorkspace';
import {
  SnippetTemplate,
  TemplateCategory,
  ThemeMode,
  ThemePreset,
  WorkspaceData,
  WorkspaceTab,
} from '../types/workspace';
import { normalizeAccentColor, normalizeThemePreset } from './theme';

const STORAGE_KEY = 'notely_workspace_v1';
const LEGACY_STORAGE_KEY = 'fluentsnip_workspace_v1';

export function parseWorkspaceString(raw: string | null): WorkspaceData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceData>;
    if (
      !parsed ||
      !Array.isArray(parsed.tabs) ||
      !Array.isArray(parsed.categories) ||
      !Array.isArray(parsed.templates)
    ) {
      return null;
    }

    const tabs = parsed.tabs;
    const activeTabId =
      parsed.activeTabId && tabs.some((t) => t.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0]?.id ?? '';

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      tabs,
      categories: parsed.categories,
      templates: parsed.templates,
      activeTabId,
      activeCategoryId: parsed.activeCategoryId || 'all',
      activeTag: parsed.activeTag ?? null,
      sortBy: parsed.sortBy || 'updated',
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      themePreset: normalizeThemePreset(parsed.themePreset),
      accentColor: normalizeAccentColor(parsed.accentColor),
    };
  } catch {
    return null;
  }
}

export function loadWorkspace(): WorkspaceData {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = parseWorkspaceString(raw);
    return parsed ?? createStarterWorkspace();
  } catch {
    return createStarterWorkspace();
  }
}

export async function loadDesktopWorkspace(): Promise<WorkspaceData | null> {
  if (!window.fluentDesktop?.isElectron) return null;
  try {
    const raw = await window.fluentDesktop.loadWorkspace();
    return parseWorkspaceString(raw);
  } catch {
    return null;
  }
}

export function saveWorkspace(data: WorkspaceData): void {
  const serialized = JSON.stringify(data);
  if (window.fluentDesktop?.isElectron) {
    void window.fluentDesktop.saveWorkspace(serialized);
  }
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota issues silently
  }
}

export interface BackupPayload {
  exportedAt: string;
  app: 'Notely';
  version: number;
  tabs: WorkspaceTab[];
  categories: TemplateCategory[];
  templates: SnippetTemplate[];
  theme?: ThemeMode;
  themePreset?: ThemePreset;
  accentColor?: string;
}

export function buildBackupPayload(data: WorkspaceData): BackupPayload {
  return {
    exportedAt: new Date().toISOString(),
    app: 'Notely',
    version: data.version,
    tabs: data.tabs,
    categories: data.categories,
    templates: data.templates,
    theme: data.theme,
    themePreset: data.themePreset,
    accentColor: data.accentColor,
  };
}

export async function downloadWorkspaceBackup(data: WorkspaceData): Promise<boolean> {
  const payload = buildBackupPayload(data);
  const jsonString = JSON.stringify(payload, null, 2);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `notely-backup-${dateStamp}.json`;

  if (window.fluentDesktop?.isElectron) {
    const res = await window.fluentDesktop.exportBackupDialog(filename, jsonString);
    return !res.canceled;
  }

  const blob = new Blob([jsonString], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export interface ParsedBackupResult {
  tabs: WorkspaceTab[];
  categories: TemplateCategory[];
  templates: SnippetTemplate[];
  theme?: ThemeMode;
  themePreset?: ThemePreset;
  accentColor?: string;
}

export function parseBackupJson(rawText: string): ParsedBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid JSON syntax. Please choose a valid Notely backup file.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file must contain a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.tabs) || !Array.isArray(obj.categories) || !Array.isArray(obj.templates)) {
    throw new Error('Backup JSON is missing required "tabs", "categories", or "templates" arrays.');
  }

  const now = new Date().toISOString();

  const tabs: WorkspaceTab[] = obj.tabs
    .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
    .map((t, index) => ({
      id: typeof t.id === 'string' && t.id.trim() ? t.id : `tab-imp-${index}-${Date.now()}`,
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : `Tab ${index + 1}`,
      order: typeof t.order === 'number' ? t.order : index,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : now,
    }));

  if (tabs.length === 0) {
    throw new Error('Backup file contains zero valid tabs.');
  }

  const validTabIds = new Set(tabs.map((t) => t.id));

  const categories: TemplateCategory[] = obj.categories
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c, index) => ({
      id: typeof c.id === 'string' && c.id.trim() ? c.id : `cat-imp-${index}-${Date.now()}`,
      tabId:
        typeof c.tabId === 'string' && validTabIds.has(c.tabId) ? c.tabId : tabs[0].id,
      name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'General',
      order: typeof c.order === 'number' ? c.order : index,
    }));

  const validCategoryIds = new Set(categories.map((c) => c.id));

  const templates: SnippetTemplate[] = obj.templates
    .filter((tpl): tpl is Record<string, unknown> => Boolean(tpl && typeof tpl === 'object'))
    .map((tpl, index) => {
      const tabId =
        typeof tpl.tabId === 'string' && validTabIds.has(tpl.tabId)
          ? tpl.tabId
          : tabs[0].id;
      const fallbackCat = categories.find((c) => c.tabId === tabId)?.id || '';
      const categoryId =
        typeof tpl.categoryId === 'string' && validCategoryIds.has(tpl.categoryId)
          ? tpl.categoryId
          : fallbackCat;

      return {
        id:
          typeof tpl.id === 'string' && tpl.id.trim()
            ? tpl.id
            : `tpl-imp-${index}-${Date.now()}`,
        tabId,
        categoryId,
        title:
          typeof tpl.title === 'string' && tpl.title.trim()
            ? tpl.title.trim()
            : 'Untitled Template',
        content: typeof tpl.content === 'string' ? tpl.content : '',
        tags: Array.isArray(tpl.tags)
          ? tpl.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
          : [],
        usageCount: typeof tpl.usageCount === 'number' ? tpl.usageCount : 0,
        createdAt: typeof tpl.createdAt === 'string' ? tpl.createdAt : now,
        updatedAt: typeof tpl.updatedAt === 'string' ? tpl.updatedAt : now,
        lastCopiedAt: typeof tpl.lastCopiedAt === 'string' ? tpl.lastCopiedAt : null,
        history: Array.isArray(tpl.history)
          ? tpl.history
              .filter(
                (h): h is Record<string, unknown> =>
                  Boolean(h && typeof h === 'object' && typeof (h as Record<string, unknown>).content === 'string')
              )
              .slice(0, 3)
              .map((h, hIdx) => ({
                id:
                  typeof h.id === 'string' && h.id.trim()
                    ? h.id
                    : `ver-imp-${index}-${hIdx}-${Date.now()}`,
                content: h.content as string,
                savedAt: typeof h.savedAt === 'string' ? h.savedAt : now,
              }))
          : [],
      };
    });

  const theme: ThemeMode | undefined =
    obj.theme === 'dark' || obj.theme === 'light' ? obj.theme : undefined;
  const themePreset: ThemePreset | undefined =
    typeof obj.themePreset === 'string'
      ? normalizeThemePreset(obj.themePreset)
      : undefined;
  const accentColor: string | undefined =
    typeof obj.accentColor === 'string'
      ? normalizeAccentColor(obj.accentColor)
      : undefined;

  return { tabs, categories, templates, theme, themePreset, accentColor };
}
