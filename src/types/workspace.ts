export interface WorkspaceTab {
  id: string;
  name: string;
  order: number;
  createdAt: string;
}

export interface TemplateCategory {
  id: string;
  tabId: string;
  name: string;
  order: number;
}

export interface TemplateVersion {
  id: string;
  content: string;
  savedAt: string;
}

export interface SnippetTemplate {
  id: string;
  tabId: string;
  categoryId: string;
  title: string;
  content: string;
  tags: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastCopiedAt: string | null;
  history?: TemplateVersion[];
}

export type SortOption = 'updated' | 'usage' | 'title';
export type ThemeMode = 'light' | 'dark';
export type CopyFormat = 'rich' | 'plain' | 'markdown';
export type InspectorViewMode = 'preview' | 'split' | 'edit';

export interface WorkspaceData {
  version: number;
  tabs: WorkspaceTab[];
  categories: TemplateCategory[];
  templates: SnippetTemplate[];
  activeTabId: string;
  activeCategoryId: string; // 'all' or category ID
  activeTag: string | null;
  sortBy: SortOption;
  theme: ThemeMode;
}

export interface ParsedVariable {
  raw: string;
  name: string;
  defaultValue: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  detail?: string;
  variant: 'success' | 'info' | 'warning' | 'error';
}
