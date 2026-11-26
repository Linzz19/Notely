import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  SnippetTemplate,
  SortOption,
  TemplateCategory,
  ThemeMode,
  ThemePreset,
  WorkspaceData,
  WorkspaceTab,
} from '../types/workspace';
import { normalizeAccentColor, normalizeThemePreset } from './theme';
import { createStarterWorkspace } from '../data/starterWorkspace';

// Blueprint-synchronized validation constants
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_NAME_LEN = 64;
const MAX_TITLE_LEN = 160;
const MAX_CONTENT_LEN = 50000;
const MAX_TAGS = 15;
const MAX_TAG_LEN = 32;
const MAX_ORDER = 1000;
const MAX_USAGE = 1000000;
const MAX_BATCH_OPS = 400;

export interface CloudSettingsRecord {
  theme: ThemeMode;
  themePreset: ThemePreset;
  accentColor: string;
  activeTabId: string;
  sortBy: SortOption;
}

export interface CloudWorkspaceSnapshot {
  exists: boolean;
  settings: CloudSettingsRecord | null;
  tabs: WorkspaceTab[];
  categories: TemplateCategory[];
  templates: SnippetTemplate[];
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 128);
  if (VALID_ID_REGEX.test(cleaned)) return cleaned;
  return `${fallbackPrefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function sanitizeOptionalId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return VALID_ID_REGEX.test(cleaned) ? cleaned : '';
}

function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

function sanitizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags || []) {
    const cleaned = String(raw || '')
      .trim()
      .replace(/^#+/, '')
      .slice(0, MAX_TAG_LEN);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

function sanitizeSettingsForCloud(workspace: WorkspaceData): CloudSettingsRecord {
  const theme: ThemeMode = workspace.theme === 'dark' ? 'dark' : 'light';
  const themePreset: ThemePreset = normalizeThemePreset(workspace.themePreset);
  const accentColor = normalizeAccentColor(workspace.accentColor);
  const sortBy: SortOption =
    workspace.sortBy === 'usage' || workspace.sortBy === 'title'
      ? workspace.sortBy
      : 'updated';
  const activeTabId = sanitizeOptionalId(workspace.activeTabId);

  return {
    theme,
    themePreset,
    accentColor,
    activeTabId,
    sortBy,
  };
}

const utf8Encoder = new TextEncoder();

function truncateUtf8Bytes(str: string, maxBytes: number): string {
  if (utf8Encoder.encode(str).byteLength <= maxBytes) return str;
  let low = 0;
  let high = str.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (utf8Encoder.encode(str.slice(0, mid)).byteLength <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return str.slice(0, low);
}

function sanitizeTabForCloud(tab: WorkspaceTab) {
  const name =
    truncateUtf8Bytes(
      String(tab.name || 'Untitled Tab')
        .trim()
        .slice(0, MAX_NAME_LEN),
      350
    ) || 'Untitled Tab';
  return {
    name,
    order: clampNumber(tab.order, 0, MAX_ORDER),
  };
}

function sanitizeCategoryForCloud(cat: TemplateCategory) {
  const name =
    truncateUtf8Bytes(
      String(cat.name || 'General')
        .trim()
        .slice(0, MAX_NAME_LEN),
      350
    ) || 'General';
  return {
    tabId: sanitizeId(cat.tabId, 'tab'),
    name,
    order: clampNumber(cat.order, 0, MAX_ORDER),
  };
}

function sanitizeTemplateForCloud(tpl: SnippetTemplate) {
  return {
    tabId: sanitizeId(tpl.tabId, 'tab'),
    categoryId: sanitizeOptionalId(tpl.categoryId),
    title: truncateUtf8Bytes(String(tpl.title || '').slice(0, MAX_TITLE_LEN), 700),
    content: truncateUtf8Bytes(String(tpl.content || '').slice(0, MAX_CONTENT_LEN), 88000),
    tags: sanitizeTags(tpl.tags).map((t) => truncateUtf8Bytes(t, 160)),
    usageCount: clampNumber(tpl.usageCount, 0, MAX_USAGE),
    lastCopiedAt: tpl.lastCopiedAt ? String(tpl.lastCopiedAt).slice(0, 40) : '',
  };
}

function parseSettingsDoc(data: Record<string, unknown>): CloudSettingsRecord {
  return {
    theme: data.theme === 'dark' ? 'dark' : 'light',
    themePreset: normalizeThemePreset(data.themePreset),
    accentColor: normalizeAccentColor(data.accentColor),
    activeTabId: typeof data.activeTabId === 'string' ? data.activeTabId : '',
    sortBy:
      data.sortBy === 'usage' || data.sortBy === 'title'
        ? data.sortBy
        : 'updated',
  };
}

function parseTabDoc(id: string, data: Record<string, unknown>): WorkspaceTab {
  const name = typeof data.name === 'string' && data.name ? data.name : 'Untitled Tab';
  return {
    id,
    name,
    order: typeof data.order === 'number' ? data.order : 0,
    createdAt: timestampToIso(data.createdAt),
  };
}

function parseCategoryDoc(
  id: string,
  data: Record<string, unknown>
): TemplateCategory {
  const name = typeof data.name === 'string' && data.name ? data.name : 'General';
  return {
    id,
    tabId: typeof data.tabId === 'string' ? data.tabId : '',
    name,
    order: typeof data.order === 'number' ? data.order : 0,
  };
}

function parseTemplateDoc(
  id: string,
  data: Record<string, unknown>,
  localHistory?: SnippetTemplate['history']
): SnippetTemplate {
  const title = typeof data.title === 'string' ? data.title : 'Untitled Template';
  const content = typeof data.content === 'string' ? data.content : '';
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];

  return {
    id,
    tabId: typeof data.tabId === 'string' ? data.tabId : '',
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : '',
    title,
    content,
    tags,
    usageCount: typeof data.usageCount === 'number' ? data.usageCount : 0,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastCopiedAt:
      typeof data.lastCopiedAt === 'string' && data.lastCopiedAt.length > 0
        ? data.lastCopiedAt
        : null,
    history: localHistory ?? [],
  };
}

/**
 * Fetches the user's complete cloud workspace snapshot once (used on sign-in).
 */
export async function fetchCloudWorkspace(
  uid: string
): Promise<CloudWorkspaceSnapshot> {
  const userPath = `users/${uid}`;
  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!userSnap.exists()) {
    return {
      exists: false,
      settings: null,
      tabs: [],
      categories: [],
      templates: [],
    };
  }

  const settings = parseSettingsDoc(userSnap.data() as Record<string, unknown>);

  const tabsPath = `users/${uid}/tabs`;
  const categoriesPath = `users/${uid}/categories`;
  const templatesPath = `users/${uid}/templates`;

  let tabsSnap;
  try {
    tabsSnap = await getDocs(
      query(collection(db, 'users', uid, 'tabs'), where('ownerId', '==', uid))
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, tabsPath);
  }

  let catsSnap;
  try {
    catsSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'categories'),
        where('ownerId', '==', uid)
      )
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, categoriesPath);
  }

  let tplsSnap;
  try {
    tplsSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'templates'),
        where('ownerId', '==', uid)
      )
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, templatesPath);
  }

  const tabs = tabsSnap.docs
    .map((d) => parseTabDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.order - b.order);

  const categories = catsSnap.docs
    .map((d) => parseCategoryDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.order - b.order);

  const templates = tplsSnap.docs.map((d) =>
    parseTemplateDoc(d.id, d.data() as Record<string, unknown>)
  );

  return {
    exists: true,
    settings,
    tabs,
    categories,
    templates,
  };
}

interface BatchOperation {
  run: (batch: ReturnType<typeof writeBatch>) => void;
}

async function commitChunkedOperations(
  operations: BatchOperation[],
  errorPath: string
) {
  if (operations.length === 0) return;

  for (let i = 0; i < operations.length; i += MAX_BATCH_OPS) {
    const chunk = operations.slice(i, i + MAX_BATCH_OPS);
    const batch = writeBatch(db);
    for (const op of chunk) {
      op.run(batch);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, errorPath);
    }
  }
}

/**
 * Computes a minimal diff between `previous` (last known cloud state) and `next` (local state)
 * and commits only changed docs to Firestore.
 */
export async function syncWorkspaceDiffToCloud(
  uid: string,
  next: WorkspaceData,
  previous: CloudWorkspaceSnapshot | null
): Promise<CloudWorkspaceSnapshot> {
  const operations: BatchOperation[] = [];
  const nextSettings = sanitizeSettingsForCloud(next);
  const userRef = doc(db, 'users', uid);

  const hasParentDoc = Boolean(previous?.exists);

  if (!hasParentDoc) {
    operations.push({
      run: (batch) =>
        batch.set(userRef, {
          ownerId: uid,
          ...nextSettings,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
    });
  } else {
    const prevS = previous?.settings;
    const prefChanged =
      !prevS ||
      prevS.theme !== nextSettings.theme ||
      prevS.themePreset !== nextSettings.themePreset ||
      prevS.accentColor !== nextSettings.accentColor ||
      prevS.activeTabId !== nextSettings.activeTabId ||
      prevS.sortBy !== nextSettings.sortBy;

    if (prefChanged) {
      operations.push({
        run: (batch) =>
          batch.update(userRef, {
            theme: nextSettings.theme,
            themePreset: nextSettings.themePreset,
            accentColor: nextSettings.accentColor,
            activeTabId: nextSettings.activeTabId,
            sortBy: nextSettings.sortBy,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }

  // Diff Tabs
  const prevTabsMap = new Map((previous?.tabs || []).map((t) => [t.id, t]));
  const nextTabsMap = new Map<string, WorkspaceTab>();

  for (const tab of next.tabs) {
    const safeId = sanitizeId(tab.id, 'tab');
    const clean = sanitizeTabForCloud(tab);
    nextTabsMap.set(safeId, { ...tab, id: safeId, ...clean });
    const prevTab = prevTabsMap.get(safeId);
    const tabRef = doc(db, 'users', uid, 'tabs', safeId);

    if (!prevTab) {
      operations.push({
        run: (batch) =>
          batch.set(tabRef, {
            ownerId: uid,
            name: clean.name,
            order: clean.order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (prevTab.name !== clean.name || prevTab.order !== clean.order) {
      operations.push({
        run: (batch) =>
          batch.update(tabRef, {
            name: clean.name,
            order: clean.order,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }

  for (const prevId of prevTabsMap.keys()) {
    if (!nextTabsMap.has(prevId)) {
      const tabRef = doc(db, 'users', uid, 'tabs', prevId);
      operations.push({
        run: (batch) => batch.delete(tabRef),
      });
    }
  }

  // Diff Categories
  const prevCatsMap = new Map((previous?.categories || []).map((c) => [c.id, c]));
  const nextCatsMap = new Map<string, TemplateCategory>();

  for (const cat of next.categories) {
    const safeId = sanitizeId(cat.id, 'cat');
    const clean = sanitizeCategoryForCloud(cat);
    nextCatsMap.set(safeId, { ...cat, id: safeId, ...clean });
    const prevCat = prevCatsMap.get(safeId);
    const catRef = doc(db, 'users', uid, 'categories', safeId);

    if (!prevCat) {
      operations.push({
        run: (batch) =>
          batch.set(catRef, {
            ownerId: uid,
            tabId: clean.tabId,
            name: clean.name,
            order: clean.order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (
      prevCat.tabId !== clean.tabId ||
      prevCat.name !== clean.name ||
      prevCat.order !== clean.order
    ) {
      operations.push({
        run: (batch) =>
          batch.update(catRef, {
            tabId: clean.tabId,
            name: clean.name,
            order: clean.order,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }

  for (const prevId of prevCatsMap.keys()) {
    if (!nextCatsMap.has(prevId)) {
      const catRef = doc(db, 'users', uid, 'categories', prevId);
      operations.push({
        run: (batch) => batch.delete(catRef),
      });
    }
  }

  // Diff Templates
  const prevTplsMap = new Map((previous?.templates || []).map((t) => [t.id, t]));
  const nextTplsMap = new Map<string, SnippetTemplate>();

  for (const tpl of next.templates) {
    const safeId = sanitizeId(tpl.id, 'tpl');
    const clean = sanitizeTemplateForCloud(tpl);
    nextTplsMap.set(safeId, {
      ...tpl,
      id: safeId,
      ...clean,
      lastCopiedAt: clean.lastCopiedAt || null,
    });
    const prevTpl = prevTplsMap.get(safeId);
    const tplRef = doc(db, 'users', uid, 'templates', safeId);

    if (!prevTpl) {
      operations.push({
        run: (batch) =>
          batch.set(tplRef, {
            ownerId: uid,
            tabId: clean.tabId,
            categoryId: clean.categoryId,
            title: clean.title,
            content: clean.content,
            tags: clean.tags,
            usageCount: clean.usageCount,
            lastCopiedAt: clean.lastCopiedAt,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else {
      const prevTagsStr = (prevTpl.tags || []).join('\u0000');
      const nextTagsStr = clean.tags.join('\u0000');
      const prevLastCopied = prevTpl.lastCopiedAt || '';

      const contentOrMetaChanged =
        prevTpl.tabId !== clean.tabId ||
        prevTpl.categoryId !== clean.categoryId ||
        prevTpl.title !== clean.title ||
        prevTpl.content !== clean.content ||
        prevTagsStr !== nextTagsStr;

      const usageChanged =
        prevTpl.usageCount !== clean.usageCount ||
        prevLastCopied !== clean.lastCopiedAt;

      if (contentOrMetaChanged && usageChanged) {
        operations.push({
          run: (batch) =>
            batch.update(tplRef, {
              tabId: clean.tabId,
              categoryId: clean.categoryId,
              title: clean.title,
              content: clean.content,
              tags: clean.tags,
              usageCount: clean.usageCount,
              lastCopiedAt: clean.lastCopiedAt,
              updatedAt: serverTimestamp(),
            }),
        });
      } else if (contentOrMetaChanged) {
        operations.push({
          run: (batch) =>
            batch.update(tplRef, {
              tabId: clean.tabId,
              categoryId: clean.categoryId,
              title: clean.title,
              content: clean.content,
              tags: clean.tags,
              updatedAt: serverTimestamp(),
            }),
        });
      } else if (usageChanged) {
        operations.push({
          run: (batch) =>
            batch.update(tplRef, {
              usageCount: clean.usageCount,
              lastCopiedAt: clean.lastCopiedAt,
              updatedAt: serverTimestamp(),
            }),
        });
      }
    }
  }

  for (const prevId of prevTplsMap.keys()) {
    if (!nextTplsMap.has(prevId)) {
      const tplRef = doc(db, 'users', uid, 'templates', prevId);
      operations.push({
        run: (batch) => batch.delete(tplRef),
      });
    }
  }

  await commitChunkedOperations(operations, `users/${uid}`);

  return {
    exists: true,
    settings: nextSettings,
    tabs: Array.from(nextTabsMap.values()).sort((a, b) => a.order - b.order),
    categories: Array.from(nextCatsMap.values()).sort(
      (a, b) => a.order - b.order
    ),
    templates: Array.from(nextTplsMap.values()),
  };
}

/**
 * Subscribes to live Firestore changes across the user's settings, tabs, categories, and templates.
 */
export function subscribeToCloudWorkspace(
  uid: string,
  onRemoteUpdate: (snapshot: CloudWorkspaceSnapshot) => void,
  onError: (err: Error) => void
): () => void {
  let settings: CloudSettingsRecord | null = null;
  let exists = false;
  let tabs: WorkspaceTab[] = [];
  let categories: TemplateCategory[] = [];
  let templates: SnippetTemplate[] = [];
  let unsubscribed = false;

  const ready = {
    settings: false,
    tabs: false,
    categories: false,
    templates: false,
  };

  const pendingWrites = {
    settings: false,
    tabs: false,
    categories: false,
    templates: false,
  };

  const emitIfReady = () => {
    if (
      unsubscribed ||
      !ready.settings ||
      !ready.tabs ||
      !ready.categories ||
      !ready.templates ||
      pendingWrites.settings ||
      pendingWrites.tabs ||
      pendingWrites.categories ||
      pendingWrites.templates
    ) {
      return;
    }

    onRemoteUpdate({
      exists,
      settings,
      tabs,
      categories,
      templates,
    });
  };

  const handleListenerError = (err: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (wrapped) {
      onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const unsubSettings = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.metadata.hasPendingWrites) {
        pendingWrites.settings = true;
        return;
      }
      if (snap.metadata.fromCache) {
        return;
      }
      pendingWrites.settings = false;
      exists = snap.exists();
      settings = snap.exists()
        ? parseSettingsDoc(snap.data() as Record<string, unknown>)
        : null;
      ready.settings = true;
      emitIfReady();
    },
    (err) => handleListenerError(err, OperationType.GET, `users/${uid}`)
  );

  const unsubTabs = onSnapshot(
    query(collection(db, 'users', uid, 'tabs'), where('ownerId', '==', uid)),
    (snap) => {
      if (snap.metadata.hasPendingWrites) {
        pendingWrites.tabs = true;
        return;
      }
      if (snap.metadata.fromCache) {
        return;
      }
      pendingWrites.tabs = false;
      tabs = snap.docs
        .map((d) => parseTabDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.order - b.order);
      ready.tabs = true;
      emitIfReady();
    },
    (err) => handleListenerError(err, OperationType.LIST, `users/${uid}/tabs`)
  );

  const unsubCategories = onSnapshot(
    query(
      collection(db, 'users', uid, 'categories'),
      where('ownerId', '==', uid)
    ),
    (snap) => {
      if (snap.metadata.hasPendingWrites) {
        pendingWrites.categories = true;
        return;
      }
      if (snap.metadata.fromCache) {
        return;
      }
      pendingWrites.categories = false;
      categories = snap.docs
        .map((d) => parseCategoryDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.order - b.order);
      ready.categories = true;
      emitIfReady();
    },
    (err) =>
      handleListenerError(err, OperationType.LIST, `users/${uid}/categories`)
  );

  const unsubTemplates = onSnapshot(
    query(
      collection(db, 'users', uid, 'templates'),
      where('ownerId', '==', uid)
    ),
    (snap) => {
      if (snap.metadata.hasPendingWrites) {
        pendingWrites.templates = true;
        return;
      }
      if (snap.metadata.fromCache) {
        return;
      }
      pendingWrites.templates = false;
      templates = snap.docs.map((d) =>
        parseTemplateDoc(d.id, d.data() as Record<string, unknown>)
      );
      ready.templates = true;
      emitIfReady();
    },
    (err) =>
      handleListenerError(err, OperationType.LIST, `users/${uid}/templates`)
  );

  return () => {
    unsubscribed = true;
    unsubSettings();
    unsubTabs();
    unsubCategories();
    unsubTemplates();
  };
}

/**
 * Checks if a local workspace has meaningful user-authored content beyond the default starter templates.
 */
export function hasCustomLocalContent(workspace: WorkspaceData): boolean {
  const starter = createStarterWorkspace();
  const starterTabs = new Map(starter.tabs.map((t) => [t.id, t]));
  const starterCategories = new Map(starter.categories.map((c) => [c.id, c]));
  const starterTemplates = new Map(starter.templates.map((t) => [t.id, t]));

  if (
    workspace.tabs.some((t) => {
      const base = starterTabs.get(t.id);
      return !base || base.name !== t.name;
    })
  ) {
    return true;
  }

  if (
    workspace.categories.some((c) => {
      const base = starterCategories.get(c.id);
      return !base || base.name !== c.name || base.tabId !== c.tabId;
    })
  ) {
    return true;
  }

  if (
    workspace.templates.some((t) => {
      const base = starterTemplates.get(t.id);
      if (!base) return true;
      if (
        base.title !== t.title ||
        base.content !== t.content ||
        base.tabId !== t.tabId ||
        base.categoryId !== t.categoryId ||
        base.tags.join('|') !== t.tags.join('|')
      ) {
        return true;
      }
      return t.usageCount > base.usageCount;
    })
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true when a remote CloudWorkspaceSnapshot is semantically identical to the
 * current local workspace (ignoring volatile serverTimestamp updatedAt/createdAt drift).
 * Prevents redundant state resets when Firestore echoes back our own committed writes.
 */
export function isRemoteSnapshotEquivalentToLocal(
  local: WorkspaceData,
  cloud: CloudWorkspaceSnapshot
): boolean {
  const localSettings = sanitizeSettingsForCloud(local);
  if (cloud.settings) {
    if (
      localSettings.theme !== cloud.settings.theme ||
      localSettings.themePreset !== cloud.settings.themePreset ||
      localSettings.accentColor !== cloud.settings.accentColor ||
      localSettings.sortBy !== cloud.settings.sortBy
    ) {
      return false;
    }
  }

  if (local.tabs.length !== cloud.tabs.length) return false;
  const cloudTabsById = new Map(cloud.tabs.map((t) => [t.id, t]));
  for (const localTab of local.tabs) {
    const clean = sanitizeTabForCloud(localTab);
    const remote = cloudTabsById.get(localTab.id);
    if (!remote || remote.name !== clean.name || remote.order !== clean.order) {
      return false;
    }
  }

  if (local.categories.length !== cloud.categories.length) return false;
  const cloudCatsById = new Map(cloud.categories.map((c) => [c.id, c]));
  for (const localCat of local.categories) {
    const clean = sanitizeCategoryForCloud(localCat);
    const remote = cloudCatsById.get(localCat.id);
    if (
      !remote ||
      remote.tabId !== clean.tabId ||
      remote.name !== clean.name ||
      remote.order !== clean.order
    ) {
      return false;
    }
  }

  if (local.templates.length !== cloud.templates.length) return false;
  const cloudTplsById = new Map(cloud.templates.map((t) => [t.id, t]));
  for (const localTpl of local.templates) {
    const clean = sanitizeTemplateForCloud(localTpl);
    const remote = cloudTplsById.get(localTpl.id);
    if (!remote) return false;
    const remoteTags = remote.tags || [];
    if (
      remote.tabId !== clean.tabId ||
      remote.categoryId !== clean.categoryId ||
      remote.title !== clean.title ||
      remote.content !== clean.content ||
      remote.usageCount !== clean.usageCount ||
      (remote.lastCopiedAt || '') !== clean.lastCopiedAt ||
      remoteTags.length !== clean.tags.length ||
      remoteTags.some((tag, idx) => tag !== clean.tags[idx])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Applies a CloudWorkspaceSnapshot cleanly onto the current local workspace,
 * preserving local-only version history, keeping active selections valid,
 * and protecting any locally dirty templates from being overwritten by stale snapshots.
 */
export function mergeSnapshotIntoLocalWorkspace(
  currentLocal: WorkspaceData,
  cloud: CloudWorkspaceSnapshot,
  options?: {
    protectedTemplateIds?: ReadonlySet<string>;
    excludedTemplateIds?: ReadonlySet<string>;
  }
): WorkspaceData {
  const protectedIds = options?.protectedTemplateIds;
  const excludedIds = options?.excludedTemplateIds;
  const localById = new Map(currentLocal.templates.map((t) => [t.id, t]));
  const localHistoryMap = new Map(
    currentLocal.templates.map((t) => [t.id, t.history ?? []])
  );

  const tabs = cloud.tabs.length > 0 ? cloud.tabs : currentLocal.tabs;
  const categories = cloud.categories;

  const seenIds = new Set<string>();
  const templates: SnippetTemplate[] = [];
  for (const remoteTpl of cloud.templates) {
    if (excludedIds?.has(remoteTpl.id)) {
      continue;
    }
    seenIds.add(remoteTpl.id);
    if (protectedIds?.has(remoteTpl.id)) {
      const localTpl = localById.get(remoteTpl.id);
      if (localTpl) {
        templates.push(localTpl);
        continue;
      }
    }
    templates.push({
      ...remoteTpl,
      history: localHistoryMap.get(remoteTpl.id) ?? [],
    });
  }

  // Retain newly created local templates that are still pending cloud sync
  if (protectedIds && protectedIds.size > 0) {
    for (const localTpl of currentLocal.templates) {
      if (
        protectedIds.has(localTpl.id) &&
        !excludedIds?.has(localTpl.id) &&
        !seenIds.has(localTpl.id)
      ) {
        templates.unshift(localTpl);
      }
    }
  }

  const validTabIds = new Set(tabs.map((t) => t.id));
  const preferredTabId =
    validTabIds.has(currentLocal.activeTabId)
      ? currentLocal.activeTabId
      : cloud.settings?.activeTabId && validTabIds.has(cloud.settings.activeTabId)
        ? cloud.settings.activeTabId
        : tabs[0]?.id ?? '';

  return {
    ...currentLocal,
    tabs,
    categories,
    templates,
    activeTabId: preferredTabId,
    theme: cloud.settings?.theme ?? currentLocal.theme,
    themePreset: cloud.settings?.themePreset ?? currentLocal.themePreset,
    accentColor: cloud.settings?.accentColor ?? currentLocal.accentColor,
    sortBy: cloud.settings?.sortBy ?? currentLocal.sortBy,
  };
}

/**
 * Merges unique local tabs/categories/templates with an existing cloud workspace (zero data loss).
 */
export function combineLocalAndCloudWorkspaces(
  local: WorkspaceData,
  cloud: CloudWorkspaceSnapshot
): WorkspaceData {
  const mergedTabs = [...cloud.tabs];
  const mergedCategories = [...cloud.categories];
  const mergedTemplates = [...cloud.templates];

  const existingTabNames = new Set(
    mergedTabs.map((t) => t.name.trim().toLowerCase())
  );
  const existingTplKeys = new Set(
    mergedTemplates.map(
      (t) => `${t.title.trim().toLowerCase()}::${t.content.trim()}`
    )
  );

  const tabIdRemap = new Map<string, string>();
  const catIdRemap = new Map<string, string>();
  const stamp = Date.now().toString(36);

  for (const localTab of local.tabs) {
    const matchByName = mergedTabs.find(
      (t) => t.name.trim().toLowerCase() === localTab.name.trim().toLowerCase()
    );
    if (matchByName) {
      tabIdRemap.set(localTab.id, matchByName.id);
    } else if (!existingTabNames.has(localTab.name.trim().toLowerCase())) {
      const freshId = `tab-${stamp}-${mergedTabs.length}`;
      tabIdRemap.set(localTab.id, freshId);
      mergedTabs.push({
        ...localTab,
        id: freshId,
        order: mergedTabs.length,
      });
      existingTabNames.add(localTab.name.trim().toLowerCase());
    }
  }

  for (const localCat of local.categories) {
    const targetTabId = tabIdRemap.get(localCat.tabId) || mergedTabs[0]?.id || '';
    const matchCat = mergedCategories.find(
      (c) =>
        c.tabId === targetTabId &&
        c.name.trim().toLowerCase() === localCat.name.trim().toLowerCase()
    );
    if (matchCat) {
      catIdRemap.set(localCat.id, matchCat.id);
    } else {
      const freshCatId = `cat-${stamp}-${mergedCategories.length}`;
      catIdRemap.set(localCat.id, freshCatId);
      mergedCategories.push({
        ...localCat,
        id: freshCatId,
        tabId: targetTabId,
        order: mergedCategories.filter((c) => c.tabId === targetTabId).length,
      });
    }
  }

  for (const localTpl of local.templates) {
    const dedupeKey = `${localTpl.title.trim().toLowerCase()}::${localTpl.content.trim()}`;
    if (existingTplKeys.has(dedupeKey)) continue;
    const freshTplId = `tpl-${stamp}-${mergedTemplates.length}`;
    mergedTemplates.push({
      ...localTpl,
      id: freshTplId,
      tabId: tabIdRemap.get(localTpl.tabId) || mergedTabs[0]?.id || '',
      categoryId: localTpl.categoryId
        ? catIdRemap.get(localTpl.categoryId) || ''
        : '',
    });
    existingTplKeys.add(dedupeKey);
  }

  return {
    ...local,
    tabs: mergedTabs,
    categories: mergedCategories,
    templates: mergedTemplates,
    activeTabId: mergedTabs[0]?.id ?? local.activeTabId,
    activeCategoryId: 'all',
    activeTag: null,
    theme: cloud.settings?.theme ?? local.theme,
    themePreset: cloud.settings?.themePreset ?? local.themePreset,
    accentColor: cloud.settings?.accentColor ?? local.accentColor,
    sortBy: cloud.settings?.sortBy ?? local.sortBy,
  };
}
