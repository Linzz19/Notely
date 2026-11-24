export interface DesktopClipboardPayload {
  format: 'rich' | 'plain' | 'markdown';
  html?: string;
  text: string;
}

export interface DesktopExportResult {
  canceled: boolean;
  filePath?: string;
}

export interface DesktopImportResult {
  canceled: boolean;
  filePath?: string;
  content?: string;
}

export interface DesktopThemePayload {
  mode: 'light' | 'dark';
  color: string;
  symbolColor: string;
}

export type CloseButtonBehavior = 'tray' | 'exit';

export interface DesktopPreferences {
  closeBehavior: CloseButtonBehavior;
  openAtLogin: boolean;
  canConfigureStartup: boolean;
  isPortable: boolean;
}

export interface DesktopPreferencesPatch {
  closeBehavior?: CloseButtonBehavior;
  openAtLogin?: boolean;
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number;
  errorMessage: string | null;
  canUpdate: boolean;
  isPortable: boolean;
}

export interface DesktopGoogleAuthResult {
  ok: boolean;
  idToken?: string | null;
  accessToken?: string | null;
  code?: string;
  message?: string;
}

export interface NotelyAuthBridge {
  complete: (payload: {
    idToken?: string | null;
    accessToken?: string | null;
  }) => void;
  fail: (error: { code?: string; message?: string }) => void;
}

export interface FluentDesktopBridge {
  isElectron: boolean;
  platform: string;
  globalShortcut: string;
  loadWorkspace: () => Promise<string | null>;
  saveWorkspace: (jsonString: string) => Promise<boolean>;
  getWorkspacePath: () => Promise<string>;
  openDataFolder: () => Promise<string>;
  writeClipboard: (payload: DesktopClipboardPayload) => Promise<boolean>;
  syncTheme: (theme: 'light' | 'dark' | DesktopThemePayload) => Promise<void>;
  getDesktopPreferences: () => Promise<DesktopPreferences>;
  setDesktopPreferences: (
    patch: DesktopPreferencesPatch
  ) => Promise<DesktopPreferences>;
  getUpdateState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
  downloadUpdate: () => Promise<AppUpdateState>;
  installUpdate: () => Promise<boolean>;
  onUpdateStatus: (callback: (state: AppUpdateState) => void) => () => void;
  exportBackupDialog: (
    defaultFilename: string,
    jsonString: string
  ) => Promise<DesktopExportResult>;
  importBackupDialog: () => Promise<DesktopImportResult>;
  signInWithGoogle?: (authDomain: string) => Promise<DesktopGoogleAuthResult>;
  onOpenQuickJump: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    fluentDesktop?: FluentDesktopBridge;
    notelyAuthBridge?: NotelyAuthBridge;
  }
}

export {};
