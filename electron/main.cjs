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
const path = require('path');

// Prevent multiple instances of Notely.exe
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
const GLOBAL_SUMMON_SHORTCUT = 'CommandOrControl+Shift+Space';

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

function getIconPath() {
  const packagedIcon = path.join(process.resourcesPath || '', 'build', 'icon.png');
  if (app.isPackaged && fs.existsSync(packagedIcon)) {
    return packagedIcon;
  }
  const localIcon = path.join(__dirname, '..', 'build', 'icon.png');
  return fs.existsSync(localIcon) ? localIcon : undefined;
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

function atomicWriteJson(filePath, dataString) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, dataString, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readInitialTheme() {
  try {
    const raw = fs.readFileSync(getWorkspaceFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getTitleBarOverlayOptions(theme) {
  if (theme === 'dark') {
    return {
      color: '#161618',
      symbolColor: '#F1F5F9',
      height: 51,
    };
  }
  return {
    color: '#F3F4F6',
    symbolColor: '#0F172A',
    height: 51,
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
    backgroundColor: initialTheme === 'dark' ? '#161618' : '#F3F4F6',
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

  // Open external links in default Windows browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('https://') ||
      url.startsWith('http://') ||
      url.startsWith('mailto:')
    ) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Minimize to Windows system tray on close unless explicitly quitting
  mainWindow.on('close', (e) => {
    saveWindowState(mainWindow);
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('resize', () => saveWindowState(mainWindow));
  mainWindow.on('move', () => saveWindowState(mainWindow));

  const devUrl = process.env.NOTELY_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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

// IPC handlers for native Windows storage, clipboard, theme, and file dialogs
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
  registerIpcHandlers();
  createMainWindow();
  createSystemTray();

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

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});
