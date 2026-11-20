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

export interface FluentDesktopBridge {
  isElectron: boolean;
  platform: string;
  globalShortcut: string;
  loadWorkspace: () => Promise<string | null>;
  saveWorkspace: (jsonString: string) => Promise<boolean>;
  getWorkspacePath: () => Promise<string>;
  openDataFolder: () => Promise<string>;
  writeClipboard: (payload: DesktopClipboardPayload) => Promise<boolean>;
  syncTheme: (theme: 'light' | 'dark') => Promise<void>;
  exportBackupDialog: (
    defaultFilename: string,
    jsonString: string
  ) => Promise<DesktopExportResult>;
  importBackupDialog: () => Promise<DesktopImportResult>;
  onOpenQuickJump: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    fluentDesktop?: FluentDesktopBridge;
  }
}

export {};
