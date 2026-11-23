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
import { decryptString, encryptString, isEncryptedValue } from './crypto';
import { normalizeAccentColor, normalizeThemePreset } from './theme';

// Blueprint-synchronized validation constants (plaintext limits before optional AES-256-GCM)
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_NAME_LEN = 64;
const MAX_TITLE_LEN = 160;
const MAX_CONTENT_LEN = 50000;
const MAX_TAGS = 15;
const MAX_TAG_LEN = 32;
const MAX_ORDER = 1000;
const MAX_USAGE = 1000000;
const MAX_BATCH_OPS = 400;

export interface CloudEncryptionConfig {
  enabled: boolean;
  salt: string;
  verifier: string;
}

export interface CloudSettingsRecord {
  theme: ThemeMode;
  themePreset: ThemePreset;
  accentColor: string;
  activeTabId: string;
  sortBy: SortOption;
  encryptionEnabled: boolean;
  encryptionSalt: string;
  encryptionVerifier: string;
}

export interface CloudWorkspaceSnapshot {
  exists: boolean;
  requiresUnlock: boolean;
  settings: CloudSettingsRecord | null;
  tabs: WorkspaceTab[];
  categories: TemplateCategory[];
  templates: SnippetTemplate[];
}

export interface SyncEncryptionOptions {
  encryptionKey?: CryptoKey | null;
  encryptionConfig?: CloudEncryptionConfig;
  forceReencryptAll?: boolean;
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

function sanitizeSettingsForCloud(
  workspace: WorkspaceData,
  encConfig?: CloudEncryptionConfig
): CloudSettingsRecord {
  const theme: ThemeMode = workspace.theme === 'dark' ? 'dark' : 'light';
  const themePreset: ThemePreset = normalizeThemePreset(workspace.themePreset);
  const accentColor = normalizeAccentColor(workspace.accentColor);
  const sortBy: SortOption =
    workspace.sortBy === 'usage' || workspace.sortBy === 'title'
      ? workspace.sortBy
      : 'updated';
  const activeTabId = sanitizeOptionalId(workspace.activeTabId);

  const encryptionEnabled = Boolean(encConfig?.enabled && encConfig.salt && encConfig.verifier);
  const encryptionSalt = encryptionEnabled ? encConfig!.salt.slice(0, 64) : '';
  const encryptionVerifier = encryptionEnabled ? encConfig!.verifier.slice(0, 256) : '';

  return {
    theme,
    themePreset,
    accentColor,
    activeTabId,
    sortBy,
    encryptionEnabled,
    encryptionSalt,
    encryptionVerifier,
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
  const encryptionEnabled = data.encryptionEnabled === true;
  const encryptionSalt =
    encryptionEnabled && typeof data.encryptionSalt === 'string'
      ? data.encryptionSalt
      : '';
  const encryptionVerifier =
    encryptionEnabled && typeof data.encryptionVerifier === 'string'
      ? data.encryptionVerifier
      : '';

  return {
    theme: data.theme === 'dark' ? 'dark' : 'light',
    themePreset: normalizeThemePreset(data.themePreset),
    accentColor: normalizeAccentColor(data.accentColor),
    activeTabId: typeof data.activeTabId === 'string' ? data.activeTabId : '',
    sortBy:
      data.sortBy === 'usage' || data.sortBy === 'title'
        ? data.sortBy
        : 'updated',
    encryptionEnabled: Boolean(encryptionEnabled && encryptionSalt && encryptionVerifier),
    encryptionSalt,
    encryptionVerifier,
  };
}

async function safeDecryptField(
  value: unknown,
  fallback: string,
  key: CryptoKey | null
): Promise<string> {
  if (typeof value !== 'string') return fallback;
  if (!isEncryptedValue(value)) return value;
  if (!key) return fallback;
  try {
    return await decryptString(value, key);
  } catch {
    return fallback;
  }
}

async function parseTabDoc(
  id: string,
  data: Record<string, unknown>,
  key: CryptoKey | null
): Promise<WorkspaceTab> {
  const name = await safeDecryptField(data.name, 'Untitled Tab', key);
  return {
    id,
    name: name || 'Untitled Tab',
    order: typeof data.order === 'number' ? data.order : 0,
    createdAt: timestampToIso(data.createdAt),
  };
}

async function parseCategoryDoc(
  id: string,
  data: Record<string, unknown>,
  key: CryptoKey | null
): Promise<TemplateCategory> {
  const name = await safeDecryptField(data.name, 'General', key);
  return {
    id,
    tabId: typeof data.tabId === 'string' ? data.tabId : '',
    name: name || 'General',
    order: typeof data.order === 'number' ? data.order : 0,
  };
}

async function parseTemplateDoc(
  id: string,
  data: Record<string, unknown>,
  key: CryptoKey | null,
  localHistory?: SnippetTemplate['history']
): Promise<SnippetTemplate> {
  const title = await safeDecryptField(data.title, 'Untitled Template', key);
  const content = await safeDecryptField(data.content, '', key);
  const rawTags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string')
    : [];
  const tags = (
    await Promise.all(rawTags.map((tag) => safeDecryptField(tag, '', key)))
  ).filter((tag) => tag.length > 0);

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
 * Fetches the user's complete cloud workspace snapshot once (used on sign-in or vault unlock).
 */
export async function fetchCloudWorkspace(
  uid: string,
  encryptionKey: CryptoKey | null = null
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
      requiresUnlock: false,
      settings: null,
      tabs: [],
      categories: [],
      templates: [],
    };
  }

  const settings = parseSettingsDoc(userSnap.data() as Record<string, unknown>);

  // If this account uses E2EE and the vault isn't unlocked yet, pause before loading encrypted docs
  if (settings.encryptionEnabled && !encryptionKey) {
    return {
      exists: true,
      requiresUnlock: true,
      settings,
      tabs: [],
      categories: [],
      templates: [],
    };
  }

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

  const activeKey = settings.encryptionEnabled ? encryptionKey : null;

  const tabs = (
    await Promise.all(
      tabsSnap.docs.map((d) =>
        parseTabDoc(d.id, d.data() as Record<string, unknown>, activeKey)
      )
    )
  ).sort((a, b) => a.order - b.order);

  const categories = (
    await Promise.all(
      catsSnap.docs.map((d) =>
        parseCategoryDoc(d.id, d.data() as Record<string, unknown>, activeKey)
      )
    )
  ).sort((a, b) => a.order - b.order);

  const templates = await Promise.all(
    tplsSnap.docs.map((d) =>
      parseTemplateDoc(d.id, d.data() as Record<string, unknown>, activeKey)
    )
  );

  return {
    exists: true,
    requiresUnlock: false,
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
 * Computes a minimal diff between `previous` (last known decrypted cloud state) and `next` (local state),
 * encrypts sensitive fields with AES-256-GCM when E2EE is enabled, and commits only changed docs.
 */
export async function syncWorkspaceDiffToCloud(
  uid: string,
  next: WorkspaceData,
  previous: CloudWorkspaceSnapshot | null,
  options?: SyncEncryptionOptions
): Promise<CloudWorkspaceSnapshot> {
  const operations: BatchOperation[] = [];
  const activeEncConfig: CloudEncryptionConfig | undefined =
    options?.encryptionConfig ??
    (previous?.settings
      ? {
          enabled: previous.settings.encryptionEnabled,
          salt: previous.settings.encryptionSalt,
          verifier: previous.settings.encryptionVerifier,
        }
      : undefined);

  const shouldEncrypt = Boolean(activeEncConfig?.enabled && options?.encryptionKey);
  const encKey = shouldEncrypt ? options?.encryptionKey ?? null : null;
  const forceAll = Boolean(options?.forceReencryptAll);

  const nextSettings = sanitizeSettingsForCloud(next, activeEncConfig);
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

    const encMetaChanged =
      !prevS ||
      prevS.encryptionEnabled !== nextSettings.encryptionEnabled ||
      prevS.encryptionSalt !== nextSettings.encryptionSalt ||
      prevS.encryptionVerifier !== nextSettings.encryptionVerifier;

    if (prefChanged && encMetaChanged) {
      operations.push({
        run: (batch) =>
          batch.update(userRef, {
            ...nextSettings,
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (encMetaChanged) {
      operations.push({
        run: (batch) =>
          batch.update(userRef, {
            encryptionEnabled: nextSettings.encryptionEnabled,
            encryptionSalt: nextSettings.encryptionSalt,
            encryptionVerifier: nextSettings.encryptionVerifier,
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (prefChanged) {
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

    const needsCreate = !prevTab;
    const needsUpdate =
      forceAll || (prevTab && (prevTab.name !== clean.name || prevTab.order !== clean.order));

    if (needsCreate || needsUpdate) {
      const storedName = encKey ? await encryptString(clean.name, encKey) : clean.name;
      if (needsCreate) {
        operations.push({
          run: (batch) =>
            batch.set(tabRef, {
              ownerId: uid,
              name: storedName,
              order: clean.order,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
        });
      } else {
        operations.push({
          run: (batch) =>
            batch.update(tabRef, {
              name: storedName,
              order: clean.order,
              updatedAt: serverTimestamp(),
            }),
        });
      }
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

    const needsCreate = !prevCat;
    const needsUpdate =
      forceAll ||
      (prevCat &&
        (prevCat.tabId !== clean.tabId ||
          prevCat.name !== clean.name ||
          prevCat.order !== clean.order));

    if (needsCreate || needsUpdate) {
      const storedName = encKey ? await encryptString(clean.name, encKey) : clean.name;
      if (needsCreate) {
        operations.push({
          run: (batch) =>
            batch.set(catRef, {
              ownerId: uid,
              tabId: clean.tabId,
              name: storedName,
              order: clean.order,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
        });
      } else {
        operations.push({
          run: (batch) =>
            batch.update(catRef, {
              tabId: clean.tabId,
              name: storedName,
              order: clean.order,
              updatedAt: serverTimestamp(),
            }),
        });
      }
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
      const storedTitle = encKey ? await encryptString(clean.title, encKey) : clean.title;
      const storedContent = encKey ? await encryptString(clean.content, encKey) : clean.content;
      const storedTags = encKey
        ? await Promise.all(clean.tags.map((tag) => encryptString(tag, encKey)))
        : clean.tags;

      operations.push({
        run: (batch) =>
          batch.set(tplRef, {
            ownerId: uid,
            tabId: clean.tabId,
            categoryId: clean.categoryId,
            title: storedTitle,
            content: storedContent,
            tags: storedTags,
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
        forceAll ||
        prevTpl.tabId !== clean.tabId ||
        prevTpl.categoryId !== clean.categoryId ||
        prevTpl.title !== clean.title ||
        prevTpl.content !== clean.content ||
        prevTagsStr !== nextTagsStr;

      const usageChanged =
        prevTpl.usageCount !== clean.usageCount ||
        prevLastCopied !== clean.lastCopiedAt;

      if (contentOrMetaChanged && usageChanged) {
        const storedTitle = encKey ? await encryptString(clean.title, encKey) : clean.title;
        const storedContent = encKey ? await encryptString(clean.content, encKey) : clean.content;
        const storedTags = encKey
          ? await Promise.all(clean.tags.map((tag) => encryptString(tag, encKey)))
          : clean.tags;

        operations.push({
          run: (batch) =>
            batch.update(tplRef, {
              tabId: clean.tabId,
              categoryId: clean.categoryId,
              title: storedTitle,
              content: storedContent,
              tags: storedTags,
              usageCount: clean.usageCount,
              lastCopiedAt: clean.lastCopiedAt,
              updatedAt: serverTimestamp(),
            }),
        });
      } else if (contentOrMetaChanged) {
        const storedTitle = encKey ? await encryptString(clean.title, encKey) : clean.title;
        const storedContent = encKey ? await encryptString(clean.content, encKey) : clean.content;
        const storedTags = encKey
          ? await Promise.all(clean.tags.map((tag) => encryptString(tag, encKey)))
          : clean.tags;

        operations.push({
          run: (batch) =>
            batch.update(tplRef, {
              tabId: clean.tabId,
              categoryId: clean.categoryId,
              title: storedTitle,
              content: storedContent,
              tags: storedTags,
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
    requiresUnlock: false,
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
 * Transparently decrypts incoming updates when an active E2EE key is loaded in memory.
 */
export function subscribeToCloudWorkspace(
  uid: string,
  getEncryptionKey: () => CryptoKey | null,
  onRemoteUpdate: (snapshot: CloudWorkspaceSnapshot) => void,
  onError: (err: Error) => void
): () => void {
  let settings: CloudSettingsRecord | null = null;
  let exists = false;
  let rawTabDocs: { id: string; data: Record<string, unknown> }[] = [];
  let rawCatDocs: { id: string; data: Record<string, unknown> }[] = [];
  let rawTplDocs: { id: string; data: Record<string, unknown> }[] = [];
  let emitSequence = 0;
  let unsubscribed = false;

  const ready = {
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
      !ready.templates
    ) {
      return;
    }

    const mySeq = ++emitSequence;
    const currentKey = getEncryptionKey();

    if (settings?.encryptionEnabled && !currentKey) {
      onRemoteUpdate({
        exists,
        requiresUnlock: true,
        settings,
        tabs: [],
        categories: [],
        templates: [],
      });
      return;
    }

    const activeKey = settings?.encryptionEnabled ? currentKey : null;

    void Promise.all([
      Promise.all(rawTabDocs.map((d) => parseTabDoc(d.id, d.data, activeKey))),
      Promise.all(rawCatDocs.map((d) => parseCategoryDoc(d.id, d.data, activeKey))),
      Promise.all(rawTplDocs.map((d) => parseTemplateDoc(d.id, d.data, activeKey))),
    ])
      .then(([tabs, categories, templates]) => {
        if (unsubscribed || mySeq !== emitSequence) return;
        onRemoteUpdate({
          exists,
          requiresUnlock: false,
          settings,
          tabs: tabs.sort((a, b) => a.order - b.order),
          categories: categories.sort((a, b) => a.order - b.order),
          templates,
        });
      })
      .catch((err) => {
        if (unsubscribed) return;
        onError(err instanceof Error ? err : new Error(String(err)));
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
      if (snap.metadata.hasPendingWrites) return;
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
      if (snap.metadata.hasPendingWrites) return;
      rawTabDocs = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
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
      if (snap.metadata.hasPendingWrites) return;
      rawCatDocs = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
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
      if (snap.metadata.hasPendingWrites) return;
      rawTplDocs = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
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
  const starterTabIds = new Set(['tab-support', 'tab-sales', 'tab-eng']);
  const starterTplIds = new Set([
    'tpl-ack',
    'tpl-escalate',
    'tpl-resolved',
    'tpl-intro',
    'tpl-recap',
    'tpl-pr',
    'tpl-incident',
  ]);

  if (workspace.tabs.some((t) => !starterTabIds.has(t.id))) return true;
  if (workspace.templates.some((t) => !starterTplIds.has(t.id))) return true;
  if (workspace.templates.some((t) => t.usageCount > 0)) return true;
  return false;
}

/**
 * Applies a CloudWorkspaceSnapshot cleanly onto the current local workspace,
 * preserving local-only version history and keeping active selections valid.
 */
export function mergeSnapshotIntoLocalWorkspace(
  currentLocal: WorkspaceData,
  cloud: CloudWorkspaceSnapshot
): WorkspaceData {
  const localHistoryMap = new Map(
    currentLocal.templates.map((t) => [t.id, t.history ?? []])
  );

  const tabs = cloud.tabs.length > 0 ? cloud.tabs : currentLocal.tabs;
  const categories = cloud.categories;
  const templates = cloud.templates.map((t) => ({
    ...t,
    history: localHistoryMap.get(t.id) ?? [],
  }));

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
