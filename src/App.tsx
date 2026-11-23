import { onAuthStateChanged, type User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudSyncStatus } from './components/AccountMenu';
import { BackupModal } from './components/BackupModal';
import { CategorySidebar } from './components/CategorySidebar';
import { CloudSyncModal } from './components/CloudSyncModal';
import { CommandPalette } from './components/CommandPalette';
import { GuideModal } from './components/GuideModal';
import { QuickFillModal } from './components/QuickFillModal';
import { TemplateInspector } from './components/TemplateInspector';
import { TemplateListPane } from './components/TemplateListPane';
import { ToastContainer } from './components/ToastContainer';
import { TopTabBar } from './components/TopTabBar';
import { UpdateBanner } from './components/UpdateBanner';
import { VaultModal, VaultModalMode } from './components/VaultModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { createStarterWorkspace } from './data/starterWorkspace';
import { auth, signInWithGoogle, signOutAccount } from './firebase';
import {
  AppUpdateState,
  DesktopPreferences,
  DesktopPreferencesPatch,
} from './types/electron';
import {
  CopyFormat,
  InspectorViewMode,
  SnippetTemplate,
  SortOption,
  TemplateCategory,
  TemplateVersion,
  ThemeMode,
  ThemePreset,
  ToastMessage,
  WorkspaceData,
  WorkspaceTab,
} from './types/workspace';
import {
  CloudEncryptionConfig,
  CloudWorkspaceSnapshot,
  combineLocalAndCloudWorkspaces,
  fetchCloudWorkspace,
  hasCustomLocalContent,
  mergeSnapshotIntoLocalWorkspace,
  subscribeToCloudWorkspace,
  syncWorkspaceDiffToCloud,
} from './utils/cloudSync';
import { createVaultConfig, unlockVaultKey } from './utils/crypto';
import {
  loadDesktopWorkspace,
  loadWorkspace,
  ParsedBackupResult,
  saveWorkspace,
} from './utils/storage';
import { copyTemplateToClipboard, extractVariables } from './utils/templateEngine';
import { applyThemeToDocument } from './utils/theme';

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
  const isDesktopApp = Boolean(window.fluentDesktop?.isElectron);
  const [desktopPrefs, setDesktopPrefs] = useState<DesktopPreferences>({
    closeBehavior: 'tray',
    openAtLogin: false,
    canConfigureStartup: false,
    isPortable: false,
  });
  const [updateState, setUpdateState] = useState<AppUpdateState>(() => ({
    status: 'unsupported',
    currentVersion:
      (import.meta.env.VITE_APP_VERSION as string | undefined) || '1.0.0',
    availableVersion: null,
    progressPercent: 0,
    errorMessage: isDesktopApp
      ? null
      : 'In-app updates apply in the Windows Setup desktop app.',
    canUpdate: false,
    isPortable: false,
  }));
  const [dismissedUpdateBannerKey, setDismissedUpdateBannerKey] = useState<
    string | null
  >(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus>('signed-out');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [pendingCloudConflict, setPendingCloudConflict] = useState<{
    uid: string;
    cloudSnapshot: CloudWorkspaceSnapshot;
  } | null>(null);
  const [encryptionConfig, setEncryptionConfig] =
    useState<CloudEncryptionConfig>({
      enabled: false,
      salt: '',
      verifier: '',
    });
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [vaultModalMode, setVaultModalMode] = useState<VaultModalMode | null>(
    null
  );
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const desktopHydratedRef = useRef(!isDesktopApp);
  const desktopHydrationResolveRef = useRef<(() => void) | null>(null);
  const desktopHydrationPromiseRef = useRef<Promise<void>>(
    isDesktopApp
      ? new Promise<void>((resolve) => {
          desktopHydrationResolveRef.current = resolve;
        })
      : Promise.resolve()
  );
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const encryptionKeyRef = useRef<CryptoKey | null>(null);
  const encryptionConfigRef = useRef(encryptionConfig);
  encryptionConfigRef.current = encryptionConfig;
  const cloudReadyRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const lastCloudSnapshotRef = useRef<CloudWorkspaceSnapshot | null>(null);
  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const editBurstRef = useRef<{ templateId: string; lastEditAt: number } | null>(
    null
  );

  // Hydrate workspace from %APPDATA%\Notely\workspace.json when running as Windows .exe
  useEffect(() => {
    if (!window.fluentDesktop?.isElectron) return;
    let cancelled = false;

    void loadDesktopWorkspace()
      .then((diskData) => {
        if (cancelled) return;
        if (diskData) {
          workspaceRef.current = diskData;
          setWorkspace(diskData);
          const firstInTab = diskData.templates.find(
            (t) => t.tabId === diskData.activeTabId
          );
          setSelectedTemplateId(firstInTab?.id ?? null);
        }
      })
      .finally(() => {
        desktopHydratedRef.current = true;
        desktopHydrationResolveRef.current?.();
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

  // Hydrate Windows desktop preferences (Close behavior + Startup) and live auto-updater state
  useEffect(() => {
    const bridge = window.fluentDesktop;
    if (!bridge?.isElectron) return;
    let cancelled = false;

    if (bridge.getDesktopPreferences) {
      void bridge.getDesktopPreferences().then((prefs) => {
        if (!cancelled && prefs) {
          setDesktopPrefs(prefs);
        }
      });
    }

    if (bridge.getUpdateState) {
      void bridge.getUpdateState().then((state) => {
        if (!cancelled && state) {
          setUpdateState(state);
        }
      });
    }

    const unsubscribe = bridge.onUpdateStatus
      ? bridge.onUpdateStatus((nextState) => {
          if (!cancelled && nextState) {
            setUpdateState(nextState);
          }
        })
      : undefined;

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Persist workspace to AppData (Electron) and localStorage
  useEffect(() => {
    if (!desktopHydratedRef.current) return;
    saveWorkspace(workspace);
  }, [workspace]);

  // Sync theme mode, surface preset, computed accent CSS variables, and Windows 11 titlebar overlay
  useEffect(() => {
    const applied = applyThemeToDocument(
      workspace.theme,
      workspace.themePreset,
      workspace.accentColor
    );
    if (window.fluentDesktop?.syncTheme) {
      void window.fluentDesktop.syncTheme({
        mode: applied.mode,
        color: applied.color,
        symbolColor: applied.symbolColor,
      });
    }
  }, [workspace.theme, workspace.themePreset, workspace.accentColor]);

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

  const startLiveCloudSubscription = useCallback((uid: string) => {
    cloudUnsubRef.current?.();
    cloudUnsubRef.current = subscribeToCloudWorkspace(
      uid,
      () => encryptionKeyRef.current,
      (remoteSnapshot) => {
        if (!remoteSnapshot.exists) return;

        if (remoteSnapshot.settings) {
          const nextEnc: CloudEncryptionConfig = {
            enabled: remoteSnapshot.settings.encryptionEnabled,
            salt: remoteSnapshot.settings.encryptionSalt,
            verifier: remoteSnapshot.settings.encryptionVerifier,
          };
          setEncryptionConfig(nextEnc);
          encryptionConfigRef.current = nextEnc;
        }

        if (remoteSnapshot.requiresUnlock) {
          cloudReadyRef.current = false;
          setIsVaultUnlocked(false);
          setCloudSyncStatus('locked');
          setVaultError(null);
          setVaultModalMode('unlock');
          return;
        }

        lastCloudSnapshotRef.current = remoteSnapshot;
        isApplyingRemoteRef.current = true;
        setWorkspace((prev) =>
          mergeSnapshotIntoLocalWorkspace(prev, remoteSnapshot)
        );
        window.setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 50);
        setCloudSyncStatus('synced');
        setCloudSyncError(null);
        setLastSyncedAt(new Date().toISOString());
      },
      (err) => {
        setCloudSyncStatus(navigator.onLine ? 'error' : 'offline');
        setCloudSyncError(
          err.message.includes('Quota exceeded')
            ? 'Daily Firestore free quota reached. Resets tomorrow.'
            : 'Unable to sync changes right now.'
        );
      }
    );
  }, []);

  // Listen to Firebase Auth state and bootstrap cloud sync cleanly
  useEffect(() => {
    let cancelled = false;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;
      setAuthUser(user);
      setAuthLoading(false);

      // Tear down previous sync session and wipe any in-memory E2EE key
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      cloudReadyRef.current = false;
      lastCloudSnapshotRef.current = null;
      encryptionKeyRef.current = null;
      const emptyEnc: CloudEncryptionConfig = {
        enabled: false,
        salt: '',
        verifier: '',
      };
      encryptionConfigRef.current = emptyEnc;
      setEncryptionConfig(emptyEnc);
      setIsVaultUnlocked(false);
      setVaultModalMode(null);
      setVaultError(null);
      setPendingCloudConflict(null);

      if (!user) {
        setCloudSyncStatus('signed-out');
        setCloudSyncError(null);
        setLastSyncedAt(null);
        return;
      }

      setCloudSyncStatus('syncing');
      setCloudSyncError(null);

      const initCloudForUser = async () => {
        try {
          await desktopHydrationPromiseRef.current;
          if (cancelled) return;
          const cloudSnapshot = await fetchCloudWorkspace(
            user.uid,
            encryptionKeyRef.current
          );
          if (cancelled) return;

          if (!cloudSnapshot.exists) {
            // Brand-new cloud account: upload local workspace automatically
            const uploaded = await syncWorkspaceDiffToCloud(
              user.uid,
              workspaceRef.current,
              null,
              {
                encryptionKey: encryptionKeyRef.current,
                encryptionConfig: encryptionConfigRef.current,
              }
            );
            if (cancelled) return;
            lastCloudSnapshotRef.current = uploaded;
            cloudReadyRef.current = true;
            setCloudSyncStatus('synced');
            setLastSyncedAt(new Date().toISOString());
            startLiveCloudSubscription(user.uid);
            return;
          }

          if (cloudSnapshot.settings) {
            const remoteEnc: CloudEncryptionConfig = {
              enabled: cloudSnapshot.settings.encryptionEnabled,
              salt: cloudSnapshot.settings.encryptionSalt,
              verifier: cloudSnapshot.settings.encryptionVerifier,
            };
            encryptionConfigRef.current = remoteEnc;
            setEncryptionConfig(remoteEnc);
          }

          // If cloud workspace uses AES-256-GCM E2EE, pause and prompt for passphrase
          if (cloudSnapshot.requiresUnlock) {
            setIsVaultUnlocked(false);
            setCloudSyncStatus('locked');
            setVaultError(null);
            setVaultModalMode('unlock');
            return;
          }

          // Existing cloud account: check if local device has unsynced custom templates
          const localNow = workspaceRef.current;
          const cloudIds = new Set(cloudSnapshot.templates.map((t) => t.id));
          const hasLocalOnlyCustom =
            hasCustomLocalContent(localNow) &&
            localNow.templates.some((t) => !cloudIds.has(t.id));

          if (hasLocalOnlyCustom && cloudSnapshot.templates.length > 0) {
            setPendingCloudConflict({ uid: user.uid, cloudSnapshot });
            setCloudSyncStatus('synced');
            return;
          }

          // Apply cloud workspace smoothly and start live sync
          lastCloudSnapshotRef.current = cloudSnapshot;
          isApplyingRemoteRef.current = true;
          setWorkspace((prev) =>
            mergeSnapshotIntoLocalWorkspace(prev, cloudSnapshot)
          );
          window.setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 50);
          cloudReadyRef.current = true;
          setCloudSyncStatus('synced');
          setLastSyncedAt(new Date().toISOString());
          startLiveCloudSubscription(user.uid);
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          setCloudSyncStatus(navigator.onLine ? 'error' : 'offline');
          setCloudSyncError(
            msg.includes('Quota exceeded')
              ? 'Daily Firestore free quota reached. Resets tomorrow.'
              : 'Could not reach Firebase Cloud Sync.'
          );
        }
      };

      void initCloudForUser();
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      cloudUnsubRef.current?.();
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [startLiveCloudSubscription]);

  // Debounced minimal-diff push to Firebase whenever local workspace changes
  useEffect(() => {
    if (!authUser || !cloudReadyRef.current || isApplyingRemoteRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    setCloudSyncStatus('syncing');
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      const uid = authUser.uid;
      void syncWorkspaceDiffToCloud(
        uid,
        workspaceRef.current,
        lastCloudSnapshotRef.current,
        {
          encryptionKey: encryptionKeyRef.current,
          encryptionConfig: encryptionConfigRef.current,
        }
      )
        .then((nextSnapshot) => {
          lastCloudSnapshotRef.current = nextSnapshot;
          setCloudSyncStatus('synced');
          setCloudSyncError(null);
          setLastSyncedAt(new Date().toISOString());
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setCloudSyncStatus(navigator.onLine ? 'error' : 'offline');
          setCloudSyncError(
            msg.includes('Quota exceeded')
              ? 'Daily Firestore free quota reached. Resets tomorrow.'
              : 'Changes saved locally — cloud sync will retry.'
          );
        });
    }, 900);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [authUser, workspace]);

  // Track browser/desktop offline & online transitions for signed-in users
  useEffect(() => {
    if (!authUser) return;
    const handleOffline = () => setCloudSyncStatus('offline');
    const handleOnline = () => {
      if (!cloudReadyRef.current) return;
      setCloudSyncStatus('syncing');
      void syncWorkspaceDiffToCloud(
        authUser.uid,
        workspaceRef.current,
        lastCloudSnapshotRef.current,
        {
          encryptionKey: encryptionKeyRef.current,
          encryptionConfig: encryptionConfigRef.current,
        }
      )
        .then((nextSnapshot) => {
          lastCloudSnapshotRef.current = nextSnapshot;
          setCloudSyncStatus('synced');
          setCloudSyncError(null);
          setLastSyncedAt(new Date().toISOString());
        })
        .catch(() => {
          setCloudSyncStatus('error');
        });
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [authUser]);

  const handleSignInGoogle = useCallback(async () => {
    try {
      setAuthLoading(true);
      await signInWithGoogle();
      pushToast('Signed in with Google', 'success', 'Cloud sync is now active.');
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      pushToast(
        'Google Sign-In failed',
        'error',
        'Please allow the sign-in popup and try again.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, [pushToast]);

  const handleSignOutGoogle = useCallback(async () => {
    try {
      encryptionKeyRef.current = null;
      await signOutAccount();
      pushToast('Signed out', 'info', 'Your templates remain saved locally.');
    } catch {
      pushToast('Sign-out failed', 'error');
    }
  }, [pushToast]);

  const handleManualCloudSync = useCallback(async () => {
    if (!authUser || !cloudReadyRef.current) return;
    setCloudSyncStatus('syncing');
    setCloudSyncError(null);
    try {
      const nextSnapshot = await syncWorkspaceDiffToCloud(
        authUser.uid,
        workspaceRef.current,
        lastCloudSnapshotRef.current,
        {
          encryptionKey: encryptionKeyRef.current,
          encryptionConfig: encryptionConfigRef.current,
        }
      );
      lastCloudSnapshotRef.current = nextSnapshot;
      setCloudSyncStatus('synced');
      setLastSyncedAt(new Date().toISOString());
      pushToast('Workspace synced to cloud', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCloudSyncStatus(navigator.onLine ? 'error' : 'offline');
      setCloudSyncError(
        msg.includes('Quota exceeded')
          ? 'Daily Firestore free quota reached.'
          : 'Sync failed. Check your connection and try again.'
      );
      pushToast('Cloud sync failed', 'error');
    }
  }, [authUser, pushToast]);

  const handleVaultSubmitPassphrase = useCallback(
    async (passphrase: string) => {
      if (!authUser || !vaultModalMode) return;
      setVaultBusy(true);
      setVaultError(null);

      try {
        if (vaultModalMode === 'setup') {
          const setup = await createVaultConfig(passphrase);
          const nextEnc: CloudEncryptionConfig = {
            enabled: true,
            salt: setup.salt,
            verifier: setup.verifier,
          };

          setCloudSyncStatus('syncing');
          const synced = await syncWorkspaceDiffToCloud(
            authUser.uid,
            workspaceRef.current,
            lastCloudSnapshotRef.current,
            {
              encryptionKey: setup.key,
              encryptionConfig: nextEnc,
              forceReencryptAll: true,
            }
          );

          encryptionKeyRef.current = setup.key;
          encryptionConfigRef.current = nextEnc;
          setEncryptionConfig(nextEnc);
          setIsVaultUnlocked(true);
          lastCloudSnapshotRef.current = synced;
          cloudReadyRef.current = true;
          setCloudSyncStatus('synced');
          setLastSyncedAt(new Date().toISOString());
          setVaultModalMode(null);
          pushToast(
            'End-to-end encryption enabled',
            'success',
            'All cloud tabs, categories, templates, and tags are now AES-256-GCM encrypted.'
          );
          return;
        }

        if (vaultModalMode === 'unlock') {
          const currentEnc = encryptionConfigRef.current;
          const key = await unlockVaultKey(
            passphrase,
            currentEnc.salt,
            currentEnc.verifier
          );
          if (!key) {
            setVaultError('Incorrect passphrase. Please try again.');
            return;
          }

          encryptionKeyRef.current = key;
          setIsVaultUnlocked(true);
          setCloudSyncStatus('syncing');

          const decryptedSnapshot = await fetchCloudWorkspace(authUser.uid, key);
          setVaultModalMode(null);

          const localNow = workspaceRef.current;
          const cloudIds = new Set(decryptedSnapshot.templates.map((t) => t.id));
          const hasLocalOnlyCustom =
            hasCustomLocalContent(localNow) &&
            localNow.templates.some((t) => !cloudIds.has(t.id));

          if (hasLocalOnlyCustom && decryptedSnapshot.templates.length > 0) {
            setPendingCloudConflict({
              uid: authUser.uid,
              cloudSnapshot: decryptedSnapshot,
            });
            setCloudSyncStatus('synced');
            return;
          }

          lastCloudSnapshotRef.current = decryptedSnapshot;
          isApplyingRemoteRef.current = true;
          setWorkspace((prev) =>
            mergeSnapshotIntoLocalWorkspace(prev, decryptedSnapshot)
          );
          window.setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 50);
          cloudReadyRef.current = true;
          setCloudSyncStatus('synced');
          setLastSyncedAt(new Date().toISOString());
          startLiveCloudSubscription(authUser.uid);
          pushToast('Encrypted vault unlocked', 'success');
        }
      } catch {
        setVaultError('Encryption operation failed. Please check your connection and try again.');
        setCloudSyncStatus('error');
      } finally {
        setVaultBusy(false);
      }
    },
    [authUser, vaultModalMode, startLiveCloudSubscription, pushToast]
  );

  const handleVaultDisableEncryption = useCallback(async () => {
    if (!authUser || !encryptionKeyRef.current) return;
    setVaultBusy(true);
    setVaultError(null);
    try {
      const nextEnc: CloudEncryptionConfig = {
        enabled: false,
        salt: '',
        verifier: '',
      };
      setCloudSyncStatus('syncing');
      const synced = await syncWorkspaceDiffToCloud(
        authUser.uid,
        workspaceRef.current,
        lastCloudSnapshotRef.current,
        {
          encryptionKey: null,
          encryptionConfig: nextEnc,
          forceReencryptAll: true,
        }
      );

      encryptionKeyRef.current = null;
      encryptionConfigRef.current = nextEnc;
      setEncryptionConfig(nextEnc);
      setIsVaultUnlocked(false);
      lastCloudSnapshotRef.current = synced;
      cloudReadyRef.current = true;
      setCloudSyncStatus('synced');
      setLastSyncedAt(new Date().toISOString());
      setVaultModalMode(null);
      pushToast('End-to-end encryption turned off', 'info');
    } catch {
      setVaultError('Could not update cloud encryption right now.');
      setCloudSyncStatus('error');
    } finally {
      setVaultBusy(false);
    }
  }, [authUser, pushToast]);

  const resolvePendingCloudConflict = useCallback(
    async (mode: 'merge' | 'cloud' | 'local') => {
      if (!pendingCloudConflict) return;
      const { uid, cloudSnapshot } = pendingCloudConflict;
      setPendingCloudConflict(null);
      setCloudSyncStatus('syncing');

      try {
        if (mode === 'cloud') {
          lastCloudSnapshotRef.current = cloudSnapshot;
          isApplyingRemoteRef.current = true;
          setWorkspace((prev) =>
            mergeSnapshotIntoLocalWorkspace(prev, cloudSnapshot)
          );
          window.setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 50);
          cloudReadyRef.current = true;
          setCloudSyncStatus('synced');
          setLastSyncedAt(new Date().toISOString());
          startLiveCloudSubscription(uid);
          pushToast('Loaded cloud workspace', 'success');
          return;
        }

        const nextWorkspace =
          mode === 'merge'
            ? combineLocalAndCloudWorkspaces(workspaceRef.current, cloudSnapshot)
            : workspaceRef.current;

        isApplyingRemoteRef.current = true;
        setWorkspace(nextWorkspace);
        const synced = await syncWorkspaceDiffToCloud(
          uid,
          nextWorkspace,
          cloudSnapshot,
          {
            encryptionKey: encryptionKeyRef.current,
            encryptionConfig: encryptionConfigRef.current,
          }
        );
        lastCloudSnapshotRef.current = synced;
        window.setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 50);
        cloudReadyRef.current = true;
        setCloudSyncStatus('synced');
        setLastSyncedAt(new Date().toISOString());
        startLiveCloudSubscription(uid);
        pushToast(
          mode === 'merge'
            ? 'Merged local & cloud workspaces'
            : 'Uploaded local workspace to cloud',
          'success'
        );
      } catch {
        setCloudSyncStatus('error');
        setCloudSyncError('Could not complete initial cloud sync.');
        pushToast('Cloud sync failed', 'error');
      }
    },
    [pendingCloudConflict, startLiveCloudSubscription, pushToast]
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

  // Single or multi-template bulk actions (from right-click context menu or bulk bar)
  const handleAssignTemplatesCategory = useCallback(
    (templateIds: string[], categoryId: string) => {
      if (templateIds.length === 0) return;
      const idSet = new Set(templateIds);
      const now = new Date().toISOString();
      const targetCatName = categoryId
        ? workspace.categories.find((c) => c.id === categoryId)?.name || 'Category'
        : 'Unassigned';

      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          idSet.has(t.id) ? { ...t, categoryId, updatedAt: now } : t
        ),
      }));
      pushToast(
        templateIds.length === 1
          ? `Assigned to ${targetCatName}`
          : `Assigned ${templateIds.length} templates to ${targetCatName}`,
        'success'
      );
    },
    [workspace.categories, pushToast]
  );

  const handleCreateCategoryAndAssign = useCallback(
    (templateIds: string[], categoryName: string) => {
      const trimmed = categoryName.trim();
      if (!trimmed || templateIds.length === 0) return;
      const newCatId = handleCreateCategory(trimmed);
      if (!newCatId) return;
      const idSet = new Set(templateIds);
      const now = new Date().toISOString();

      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          idSet.has(t.id) ? { ...t, categoryId: newCatId, updatedAt: now } : t
        ),
      }));
      pushToast(
        templateIds.length === 1
          ? `Created "${trimmed}" and assigned template`
          : `Created "${trimmed}" and assigned ${templateIds.length} templates`,
        'success'
      );
    },
    [handleCreateCategory, pushToast]
  );

  const handleMoveTemplatesToTab = useCallback(
    (templateIds: string[], targetTabId: string) => {
      if (templateIds.length === 0) return;
      const idSet = new Set(templateIds);
      const now = new Date().toISOString();
      const targetTab = workspace.tabs.find((t) => t.id === targetTabId);
      if (!targetTab) return;
      const targetFirstCatId =
        workspace.categories
          .filter((c) => c.tabId === targetTabId)
          .sort((a, b) => a.order - b.order)[0]?.id ?? '';

      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          idSet.has(t.id)
            ? {
                ...t,
                tabId: targetTabId,
                categoryId: targetFirstCatId,
                updatedAt: now,
              }
            : t
        ),
      }));

      if (selectedTemplateId && idSet.has(selectedTemplateId)) {
        setSelectedTemplateId(null);
      }

      pushToast(
        templateIds.length === 1
          ? `Moved template to "${targetTab.name}"`
          : `Moved ${templateIds.length} templates to "${targetTab.name}"`,
        'success'
      );
    },
    [workspace.tabs, workspace.categories, selectedTemplateId, pushToast]
  );

  const handleAddTagToTemplates = useCallback(
    (templateIds: string[], rawTag: string) => {
      const tag = rawTag.trim().replace(/^#+/, '').toLowerCase();
      if (!tag || templateIds.length === 0) return;
      const idSet = new Set(templateIds);
      const now = new Date().toISOString();

      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.map((t) => {
          if (!idSet.has(t.id)) return t;
          const exists = t.tags.some((existing) => existing.toLowerCase() === tag);
          if (exists) return t;
          return { ...t, tags: [...t.tags, tag], updatedAt: now };
        }),
      }));
      pushToast(
        templateIds.length === 1
          ? `Added #${tag} tag`
          : `Added #${tag} to ${templateIds.length} templates`,
        'success'
      );
    },
    [pushToast]
  );

  const handleDuplicateTemplates = useCallback(
    (templateIds: string[]) => {
      if (templateIds.length === 0) return;
      const idSet = new Set(templateIds);
      const now = new Date().toISOString();
      const singleCopyId = templateIds.length === 1 ? createId('tpl') : null;

      setWorkspace((prev) => {
        const copies: SnippetTemplate[] = prev.templates
          .filter((t) => idSet.has(t.id))
          .map((t, index) => ({
            ...t,
            id: singleCopyId && index === 0 ? singleCopyId : createId('tpl'),
            title: `${t.title} (Copy)`,
            usageCount: 0,
            createdAt: now,
            updatedAt: now,
            lastCopiedAt: null,
            history: [],
          }));
        return {
          ...prev,
          templates: [...copies, ...prev.templates],
        };
      });

      if (singleCopyId) {
        setSelectedTemplateId(singleCopyId);
      }
      pushToast(
        templateIds.length === 1
          ? 'Template duplicated'
          : `Duplicated ${templateIds.length} templates`,
        'info'
      );
    },
    [pushToast]
  );

  const handleDeleteTemplates = useCallback(
    (templateIds: string[]) => {
      if (templateIds.length === 0) return;
      const idSet = new Set(templateIds);
      setWorkspace((prev) => ({
        ...prev,
        templates: prev.templates.filter((t) => !idSet.has(t.id)),
      }));
      if (selectedTemplateId && idSet.has(selectedTemplateId)) {
        setSelectedTemplateId(null);
        setMobilePane('list');
      }
      pushToast(
        templateIds.length === 1
          ? 'Template deleted'
          : `Deleted ${templateIds.length} templates`,
        'info'
      );
    },
    [selectedTemplateId, pushToast]
  );

  const handleEditTemplateFromMenu = useCallback((templateId: string) => {
    editBurstRef.current = null;
    setSelectedTemplateId(templateId);
    setInspectorMode('edit');
    setMobilePane('inspector');
  }, []);

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
        theme: parsed.theme ?? prev.theme,
        themePreset: parsed.themePreset ?? prev.themePreset,
        accentColor: parsed.accentColor ?? prev.accentColor,
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
      themePreset: prev.themePreset,
      accentColor: prev.accentColor,
    }));
    setSelectedTemplateId(starter.templates[0]?.id ?? null);
    setSearchQuery('');
    pushToast('Restored starter workspace', 'info');
  }, [pushToast]);

  const handleChangeTheme = useCallback((theme: ThemeMode) => {
    setWorkspace((prev) => ({ ...prev, theme }));
  }, []);

  const handleChangeThemePreset = useCallback((themePreset: ThemePreset) => {
    setWorkspace((prev) => ({ ...prev, themePreset }));
  }, []);

  const handleChangeAccentColor = useCallback((accentColor: string) => {
    setWorkspace((prev) => ({ ...prev, accentColor }));
  }, []);

  const handleResetTheme = useCallback(() => {
    setWorkspace((prev) => ({
      ...prev,
      themePreset: 'default',
      accentColor: 'default',
    }));
    pushToast('Theme reset to Default Fluent', 'info');
  }, [pushToast]);

  const handleUpdateDesktopPrefs = useCallback(
    (patch: DesktopPreferencesPatch) => {
      const bridge = window.fluentDesktop;
      if (!bridge?.setDesktopPreferences) return;
      void bridge.setDesktopPreferences(patch).then((updated) => {
        if (updated) {
          setDesktopPrefs(updated);
          if (patch.closeBehavior !== undefined) {
            pushToast(
              patch.closeBehavior === 'tray'
                ? 'Close button set to Minimize to Tray'
                : 'Close button set to Exit App',
              'info'
            );
          } else if (patch.openAtLogin !== undefined) {
            pushToast(
              patch.openAtLogin
                ? 'Notely will launch at Windows startup'
                : 'Disabled launch at Windows startup',
              'info'
            );
          }
        }
      });
    },
    [pushToast]
  );

  const handleCheckForUpdates = useCallback(() => {
    const bridge = window.fluentDesktop;
    if (!bridge?.checkForUpdates) return;
    setDismissedUpdateBannerKey(null);
    void bridge.checkForUpdates().then((nextState) => {
      if (nextState) setUpdateState(nextState);
    });
  }, []);

  const handleDownloadUpdate = useCallback(() => {
    const bridge = window.fluentDesktop;
    if (!bridge?.downloadUpdate) return;
    setDismissedUpdateBannerKey(null);
    void bridge.downloadUpdate().then((nextState) => {
      if (nextState) setUpdateState(nextState);
    });
  }, []);

  const handleInstallUpdate = useCallback(() => {
    const bridge = window.fluentDesktop;
    if (!bridge?.installUpdate) return;
    void bridge.installUpdate();
  }, []);

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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--surface-frame)] text-slate-900 dark:text-slate-100">
      {/* Top Window Bar & Project Tab Strip */}
      <TopTabBar
        tabs={workspace.tabs}
        activeTabId={activeTab?.id ?? ''}
        theme={workspace.theme}
        themePreset={workspace.themePreset}
        accentColor={workspace.accentColor}
        isDesktopApp={isDesktopApp}
        desktopPrefs={desktopPrefs}
        updateState={updateState}
        authUser={authUser}
        authLoading={authLoading}
        cloudSyncStatus={cloudSyncStatus}
        lastSyncedAt={lastSyncedAt}
        cloudSyncError={cloudSyncError}
        encryptionEnabled={encryptionConfig.enabled}
        encryptionUnlocked={isVaultUnlocked}
        onSignInGoogle={() => void handleSignInGoogle()}
        onSignOutGoogle={() => void handleSignOutGoogle()}
        onSyncNow={() => void handleManualCloudSync()}
        onOpenVaultSetup={() => {
          setVaultError(null);
          setVaultModalMode('setup');
        }}
        onOpenVaultUnlock={() => {
          setVaultError(null);
          setVaultModalMode('unlock');
        }}
        onOpenVaultDisable={() => {
          setVaultError(null);
          setVaultModalMode('disable');
        }}
        onSelectTab={handleSelectTab}
        onCreateTab={handleCreateTab}
        onRenameTab={handleRenameTab}
        onDeleteTab={handleDeleteTab}
        onReorderTabs={handleReorderTabs}
        onChangeTheme={handleChangeTheme}
        onChangeThemePreset={handleChangeThemePreset}
        onChangeAccentColor={handleChangeAccentColor}
        onResetTheme={handleResetTheme}
        onUpdateDesktopPrefs={handleUpdateDesktopPrefs}
        onCheckForUpdates={handleCheckForUpdates}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
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
            tabs={workspace.tabs}
            activeTabId={activeTab?.id ?? ''}
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
            onCopyTemplateWithFormat={handleRequestCopy}
            onEditTemplate={handleEditTemplateFromMenu}
            onCreateTemplate={handleCreateTemplate}
            onAssignTemplatesCategory={handleAssignTemplatesCategory}
            onCreateCategoryAndAssign={handleCreateCategoryAndAssign}
            onMoveTemplatesToTab={handleMoveTemplatesToTab}
            onAddTagToTemplates={handleAddTagToTemplates}
            onDuplicateTemplates={handleDuplicateTemplates}
            onDeleteTemplates={handleDeleteTemplates}
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

      {/* First-Time Cloud Sync Conflict Resolution Modal */}
      {pendingCloudConflict && (
        <CloudSyncModal
          userEmail={authUser?.email ?? null}
          localTemplateCount={workspace.templates.length}
          cloudTemplateCount={pendingCloudConflict.cloudSnapshot.templates.length}
          onMerge={() => void resolvePendingCloudConflict('merge')}
          onUseCloud={() => void resolvePendingCloudConflict('cloud')}
          onUseLocal={() => void resolvePendingCloudConflict('local')}
          onCancel={() => {
            setPendingCloudConflict(null);
            void handleSignOutGoogle();
          }}
        />
      )}

      {/* Zero-Knowledge AES-256-GCM Vault Setup / Unlock Modal */}
      {vaultModalMode && (
        <VaultModal
          mode={vaultModalMode}
          busy={vaultBusy}
          error={vaultError}
          onSubmitPassphrase={(pass) => void handleVaultSubmitPassphrase(pass)}
          onDisableEncryption={() => void handleVaultDisableEncryption()}
          onClose={() => {
            if (vaultBusy) return;
            setVaultModalMode(null);
            setVaultError(null);
          }}
        />
      )}

      {/* Non-Blocking In-App Update Banner */}
      {dismissedUpdateBannerKey !==
        `${updateState.status}:${updateState.availableVersion || ''}` && (
        <UpdateBanner
          updateState={updateState}
          hasActiveToasts={toasts.length > 0}
          onDownload={handleDownloadUpdate}
          onInstall={handleInstallUpdate}
          onDismiss={() =>
            setDismissedUpdateBannerKey(
              `${updateState.status}:${updateState.availableVersion || ''}`
            )
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
