const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const LOCAL_APP_PORT = 47821;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

let localAppServer = null;
let localAppUrl = null;

function isFirebaseAuthUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.firebaseapp.com') ||
      host === 'accounts.google.com' ||
      host === 'apis.google.com' ||
      host === 'accounts.youtube.com' ||
      host === 'myaccount.google.com'
    );
  } catch {
    return false;
  }
}

function startLocalAppServer() {
  if (localAppUrl) return Promise.resolve(localAppUrl);

  const distDir = path.resolve(__dirname, '..', 'dist');

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relativePath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      let filePath = path.resolve(distDir, relativePath);

      // Strict path traversal protection
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
      });
      fs.createReadStream(filePath).pipe(res);
    });

    const onListening = () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : LOCAL_APP_PORT;
      localAppServer = server;
      localAppUrl = `http://localhost:${port}`;
      resolve(localAppUrl);
    };

    server.once('error', () => {
      // Fallback to an OS-assigned localhost port if preferred port is occupied
      server.listen(0, '127.0.0.1', onListening);
    });

    server.listen(LOCAL_APP_PORT, '127.0.0.1', onListening);
  });
}

// Prevent multiple instances of Notely.exe
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isSilentUpdateCheck = false;
const GLOBAL_SUMMON_SHORTCUT = 'CommandOrControl+Shift+Space';
const isPortableBuild = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

const DEFAULT_DESKTOP_PREFS = {
  closeBehavior: 'tray', // 'tray' | 'exit'
  openAtLogin: false,
};

let desktopPrefs = { ...DEFAULT_DESKTOP_PREFS };

function getInitialUpdateState() {
  const currentVersion = app.getVersion();
  const canUpdate = Boolean(app.isPackaged && !isPortableBuild && autoUpdater);
  return {
    status: canUpdate ? 'idle' : 'unsupported',
    currentVersion,
    availableVersion: null,
    progressPercent: 0,
    errorMessage: canUpdate
      ? null
      : isPortableBuild
        ? 'In-app updates require the Notely Setup installer.'
        : 'In-app updates are available in the installed Windows desktop app.',
    canUpdate,
    isPortable: isPortableBuild,
  };
}

let updateState = null;

function getDataDir() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getWorkspaceFilePath() {
  return path.join(getDataDir(), 'workspace.json');
}

function getWindowStatePath() {
  return path.join(getDataDir(), 'window-state.json');
}

function getDesktopPrefsPath() {
  return path.join(getDataDir(), 'desktop-prefs.json');
}

function getIconPath() {
  const packagedIcon = path.join(process.resourcesPath || '', 'electron', 'icon.png');
  if (app.isPackaged && fs.existsSync(packagedIcon)) {
    return packagedIcon;
  }
  const localIcon = path.join(__dirname, 'icon.png');
  return fs.existsSync(localIcon) ? localIcon : undefined;
}

function atomicWriteJson(filePath, dataString) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, dataString, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function canConfigureStartup() {
  return Boolean(app.isPackaged && !isPortableBuild && (process.platform === 'win32' || process.platform === 'darwin'));
}

function loadDesktopPrefs() {
  let saved = {};
  try {
    const raw = fs.readFileSync(getDesktopPrefsPath(), 'utf8');
    saved = JSON.parse(raw) || {};
  } catch {
    saved = {};
  }

  const closeBehavior = saved.closeBehavior === 'exit' ? 'exit' : 'tray';
  let openAtLogin = Boolean(saved.openAtLogin);

  if (canConfigureStartup()) {
    try {
      const osSettings = app.getLoginItemSettings();
      if (typeof osSettings.openAtLogin === 'boolean') {
        openAtLogin = osSettings.openAtLogin;
      }
    } catch {
      // Fall back to saved preference
    }
  }

  desktopPrefs = { closeBehavior, openAtLogin };
  return getDesktopPrefsPayload();
}

function saveDesktopPrefs(nextPrefs) {
  try {
    atomicWriteJson(getDesktopPrefsPath(), JSON.stringify(nextPrefs, null, 2));
  } catch {
    // Ignore non-fatal preference write failure
  }
}

function getDesktopPrefsPayload() {
  return {
    closeBehavior: desktopPrefs.closeBehavior,
    openAtLogin: desktopPrefs.openAtLogin,
    canConfigureStartup: canConfigureStartup(),
    isPortable: isPortableBuild,
  };
}

function applyDesktopPrefsPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    return getDesktopPrefsPayload();
  }

  const next = { ...desktopPrefs };

  if (patch.closeBehavior === 'tray' || patch.closeBehavior === 'exit') {
    next.closeBehavior = patch.closeBehavior;
  }

  if (typeof patch.openAtLogin === 'boolean') {
    next.openAtLogin = patch.openAtLogin;
    if (canConfigureStartup()) {
      try {
        app.setLoginItemSettings({
          openAtLogin: patch.openAtLogin,
          path: process.execPath,
        });
      } catch {
        // Ignore OS login item error
      }
    }
  }

  desktopPrefs = next;
  saveDesktopPrefs(desktopPrefs);
  return getDesktopPrefsPayload();
}

function broadcastUpdateState(patch) {
  updateState = {
    ...(updateState || getInitialUpdateState()),
    ...patch,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('updater:status', updateState);
    } catch {
      // Ignore if renderer is tearing down
    }
  }
  return updateState;
}

function setupAutoUpdater() {
  updateState = getInitialUpdateState();
  if (!updateState.canUpdate || !autoUpdater) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({
      status: 'checking',
      errorMessage: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    isSilentUpdateCheck = false;
    broadcastUpdateState({
      status: 'available',
      availableVersion: info?.version || null,
      progressPercent: 0,
      errorMessage: null,
    });
  });

  autoUpdater.on('update-not-available', () => {
    const wasSilent = isSilentUpdateCheck;
    isSilentUpdateCheck = false;
    broadcastUpdateState({
      status: wasSilent ? 'idle' : 'up-to-date',
      availableVersion: null,
      progressPercent: 0,
      errorMessage: null,
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const pct = Math.max(0, Math.min(100, Math.round(progressObj?.percent || 0)));
    broadcastUpdateState({
      status: 'downloading',
      progressPercent: pct,
      errorMessage: null,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    isSilentUpdateCheck = false;
    broadcastUpdateState({
      status: 'downloaded',
      availableVersion: info?.version || updateState?.availableVersion || null,
      progressPercent: 100,
      errorMessage: null,
    });
  });

  autoUpdater.on('error', (err) => {
    const wasSilent = isSilentUpdateCheck;
    isSilentUpdateCheck = false;
    if (wasSilent) {
      broadcastUpdateState({
        status: 'idle',
        errorMessage: null,
      });
      return;
    }
    const rawMsg = err && typeof err.message === 'string' ? err.message : 'Unable to check for updates.';
    const friendlyMsg = /ENOTFOUND|ERR_INTERNET_DISCONNECTED|ETIMEDOUT|ECONNREFUSED|net::/i.test(rawMsg)
      ? 'Could not reach GitHub Releases. Check your internet connection and try again.'
      : 'Update check failed. Please try again in a moment.';
    broadcastUpdateState({
      status: 'error',
      errorMessage: friendlyMsg,
    });
  });
}

async function triggerUpdateCheck(silent = false) {
  if (!updateState) {
    updateState = getInitialUpdateState();
  }
  if (!updateState.canUpdate || !autoUpdater) {
    return updateState;
  }
  if (updateState.status === 'checking' || updateState.status === 'downloading') {
    return updateState;
  }

  isSilentUpdateCheck = silent;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    if (silent) {
      isSilentUpdateCheck = false;
      broadcastUpdateState({ status: 'idle', errorMessage: null });
    } else {
      isSilentUpdateCheck = false;
      const rawMsg = err && typeof err.message === 'string' ? err.message : '';
      const friendlyMsg = /ENOTFOUND|ERR_INTERNET_DISCONNECTED|ETIMEDOUT|ECONNREFUSED|net::/i.test(rawMsg)
        ? 'Could not reach GitHub Releases. Check your internet connection and try again.'
        : 'Unable to check for updates right now.';
      broadcastUpdateState({
        status: 'error',
        errorMessage: friendlyMsg,
      });
    }
  }
  return updateState;
}

function loadWindowState() {
  const defaults = { width: 1280, height: 820, isMaximized: false };
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      width: typeof parsed.width === 'number' && parsed.width >= 760 ? parsed.width : defaults.width,
      height: typeof parsed.height === 'number' && parsed.height >= 520 ? parsed.height : defaults.height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch {
    return defaults;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore non-fatal bounds write failure
  }
}

const PRESET_FRAME_OVERLAYS = {
  default: {
    light: { color: '#F3F4F6', symbolColor: '#1E293B' },
    dark: { color: '#161618', symbolColor: '#F1F5F9' },
  },
  'warm-paper': {
    light: { color: '#F3EFE7', symbolColor: '#292524' },
    dark: { color: '#191614', symbolColor: '#F5F0E8' },
  },
  'forest-slate': {
    light: { color: '#EDF2EE', symbolColor: '#1C2A22' },
    dark: { color: '#131917', symbolColor: '#ECFDF5' },
  },
  'midnight-indigo': {
    light: { color: '#EEF1F8', symbolColor: '#1E2438' },
    dark: { color: '#121521', symbolColor: '#EEF2FF' },
  },
  'high-contrast': {
    light: { color: '#E8ECF0', symbolColor: '#0F172A' },
    dark: { color: '#09090B', symbolColor: '#FFFFFF' },
  },
};

function readInitialTheme() {
  try {
    const raw = fs.readFileSync(getWorkspaceFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const mode = parsed?.theme === 'dark' ? 'dark' : 'light';
    const presetKey =
      typeof parsed?.themePreset === 'string' && PRESET_FRAME_OVERLAYS[parsed.themePreset]
        ? parsed.themePreset
        : 'default';
    const overlay = PRESET_FRAME_OVERLAYS[presetKey][mode];
    return { mode, color: overlay.color, symbolColor: overlay.symbolColor };
  } catch {
    const fallback = PRESET_FRAME_OVERLAYS.default.light;
    return { mode: 'light', color: fallback.color, symbolColor: fallback.symbolColor };
  }
}

function getTitleBarOverlayOptions(themeInput) {
  if (
    themeInput &&
    typeof themeInput === 'object' &&
    typeof themeInput.color === 'string' &&
    typeof themeInput.symbolColor === 'string'
  ) {
    return {
      color: themeInput.color,
      symbolColor: themeInput.symbolColor,
      height: 34,
    };
  }
  const mode = themeInput === 'dark' ? 'dark' : 'light';
  const fallback = PRESET_FRAME_OVERLAYS.default[mode];
  return {
    color: fallback.color,
    symbolColor: fallback.symbolColor,
    height: 34,
  };
}

function showAndFocusWindow(openQuickJump = false) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();

  if (openQuickJump) {
    mainWindow.webContents.send('desktop:open-quick-jump');
  }
}

function createMainWindow() {
  const winState = loadWindowState();
  const initialTheme = readInitialTheme();
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    x: winState.x,
    y: winState.y,
    minWidth: 760,
    minHeight: 520,
    title: 'Notely',
    icon: iconPath,
    backgroundColor: initialTheme.color,
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: getTitleBarOverlayOptions(initialTheme),
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (winState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Allow Firebase/Google OAuth popups; open all other external links in default Windows browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isFirebaseAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 660,
          autoHideMenuBar: true,
          title: 'Sign in to Notely',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    if (
      url.startsWith('https://') ||
      url.startsWith('http://') ||
      url.startsWith('mailto:')
    ) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Honor user's Close Button (X) preference: Minimize to Tray vs Exit App
  mainWindow.on('close', (e) => {
    saveWindowState(mainWindow);
    if (!isQuitting && desktopPrefs.closeBehavior === 'tray' && tray) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    isQuitting = true;
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  mainWindow.on('resize', () => saveWindowState(mainWindow));
  mainWindow.on('move', () => saveWindowState(mainWindow));

  const devUrl = process.env.NOTELY_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    void startLocalAppServer()
      .then((url) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(url);
        }
      })
      .catch(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
        }
      });
  }
}

function createSystemTray() {
  const iconPath = getIconPath();
  if (!iconPath) return;

  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Notely — Ctrl+Shift+Space to open');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Notely',
      click: () => showAndFocusWindow(false),
    },
    {
      label: 'Quick Jump (Ctrl+K)',
      click: () => showAndFocusWindow(true),
    },
    { type: 'separator' },
    {
      label: 'Check for Updates...',
      click: () => {
        showAndFocusWindow(false);
        void triggerUpdateCheck(false);
      },
    },
    {
      label: 'Open Local Data Folder',
      click: () => {
        shell.openPath(getDataDir());
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Notely',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      showAndFocusWindow(false);
      return;
    }
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      showAndFocusWindow(false);
    }
  });
}

// IPC handlers for native Windows storage, clipboard, theme, desktop preferences, updates, and file dialogs
function registerIpcHandlers() {
  ipcMain.handle('workspace:load', () => {
    const filePath = getWorkspaceFilePath();
    try {
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('workspace:save', (_event, jsonString) => {
    if (typeof jsonString !== 'string') return false;
    try {
      atomicWriteJson(getWorkspaceFilePath(), jsonString);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('workspace:getPath', () => getWorkspaceFilePath());

  ipcMain.handle('workspace:openFolder', async () => {
    const dir = getDataDir();
    await shell.openPath(dir);
    return dir;
  });

  ipcMain.handle('clipboard:write', (_event, payload) => {
    try {
      if (payload.format === 'rich' && payload.html) {
        clipboard.write({
          html: payload.html,
          text: payload.text || '',
        });
      } else {
        clipboard.writeText(payload.text || '');
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('theme:sync', (_event, theme) => {
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      try {
        mainWindow.setTitleBarOverlay(getTitleBarOverlayOptions(theme));
      } catch {
        // Ignore on unsupported OS versions
      }
    }
  });

  ipcMain.handle('desktop:getPreferences', () => getDesktopPrefsPayload());

  ipcMain.handle('desktop:setPreferences', (_event, patch) =>
    applyDesktopPrefsPatch(patch)
  );

  ipcMain.handle('updater:getState', () => updateState || getInitialUpdateState());

  ipcMain.handle('updater:check', async () => triggerUpdateCheck(false));

  ipcMain.handle('updater:download', async () => {
    if (!updateState?.canUpdate || !autoUpdater) {
      return updateState || getInitialUpdateState();
    }
    if (updateState.status === 'downloading' || updateState.status === 'downloaded') {
      return updateState;
    }
    try {
      broadcastUpdateState({ status: 'downloading', progressPercent: 0, errorMessage: null });
      await autoUpdater.downloadUpdate();
    } catch {
      broadcastUpdateState({
        status: 'error',
        errorMessage: 'Download interrupted. Check your connection and try again.',
      });
    }
    return updateState;
  });

  ipcMain.handle('updater:install', () => {
    if (!updateState?.canUpdate || !autoUpdater || updateState.status !== 'downloaded') {
      return false;
    }
    // Ensure system tray close interception does not block installer restart
    isQuitting = true;
    if (tray) {
      tray.destroy();
      tray = null;
    }
    setImmediate(() => {
      autoUpdater.quitAndInstall(true, true);
    });
    return true;
  });

  ipcMain.handle('backup:export', async (_event, defaultFilename, jsonString) => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Notely Workspace Backup',
      defaultPath: defaultFilename,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, jsonString, 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('backup:import', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Notely Workspace Backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    return { canceled: false, filePath, content };
  });
}

app.on('second-instance', () => {
  showAndFocusWindow(false);
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.notely.desktop');
  Menu.setApplicationMenu(null);
  loadDesktopPrefs();
  setupAutoUpdater();
  registerIpcHandlers();
  createMainWindow();
  createSystemTray();

  // Silent startup update check 4 seconds after launch (installed builds only)
  if (updateState?.canUpdate) {
    setTimeout(() => {
      void triggerUpdateCheck(true);
    }, 4000);
  }

  // Global hotkey to summon/hide Notely from any Windows application
  try {
    globalShortcut.register(GLOBAL_SUMMON_SHORTCUT, () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        showAndFocusWindow(true);
        return;
      }
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        showAndFocusWindow(true);
      }
    });
  } catch {
    // Shortcut already claimed by another app
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setUserAgent(CHROME_USER_AGENT);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (localAppServer) {
    try {
      localAppServer.close();
    } catch {
      // Ignore close error on exit
    }
    localAppServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (isQuitting || desktopPrefs.closeBehavior === 'exit')) {
    app.quit();
  }
});
