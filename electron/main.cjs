const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  safeStorage,
  session,
  shell,
  Tray,
} = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const MAX_WORKSPACE_BYTES = 20 * 1024 * 1024; // 20 MB safety bound
const DPAPI_ENVELOPE_FORMAT = 'dpapi-v1';

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

const AUTH_BRIDGE_PARTITION = 'persist:notely-auth-bridge';
const AUTH_BRIDGE_PATH = '/__notely_auth_bridge__';
const AUTH_DOMAIN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(firebaseapp\.com|web\.app)$/i;
const DEFAULT_WEB_AUTH_URL =
  'https://ais-pre-hk54y74c2flsdo7nhoqcri-470217181044.asia-east1.run.app';
const MAX_OAUTH_TOKEN_LENGTH = 16384;
const MAX_AUTH_CALLBACK_BYTES = 32 * 1024;
const AUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const WEB_AUTH_PROBE_TIMEOUT_MS = 2500;

let localAppServer = null;
let localAppUrl = null;
let activeAuthOrigin = null;
let activeAuthWindow = null;
let activeBrowserAuthSession = null;

function isFirebaseAuthUrl(rawUrl) {
  // Firebase signInWithPopup opens an empty / about:blank window synchronously
  // before redirecting it to https://<project>.firebaseapp.com/__/auth/handler.
  if (!rawUrl || rawUrl === 'about:blank') {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.web.app') ||
      host === 'accounts.google.com' ||
      host === 'apis.google.com' ||
      host === 'accounts.youtube.com' ||
      host === 'myaccount.google.com' ||
      host === 'consent.google.com' ||
      host === 'gds.google.com'
    );
  } catch {
    return false;
  }
}

function startLocalAppServer() {
  if (localAppUrl) return Promise.resolve(localAppUrl);

  const distDir = path.resolve(__dirname, '..', 'dist');
  const distDirPrefix = distDir + path.sep;
  let boundPort = LOCAL_APP_PORT;

  const CSP_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://www.gstatic.com https://*.firebaseapp.com https://www.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://*.googleusercontent.com https://*.gstatic.com",
    "connect-src 'self' https://*.googleapis.com https://www.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com",
    "frame-src https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // DNS rebinding guard: accept only local loopback Host headers
      const hostHeader = String(req.headers.host || '').toLowerCase();
      const allowedHosts = new Set([
        `localhost:${boundPort}`,
        `127.0.0.1:${boundPort}`,
      ]);
      if (!allowedHosts.has(hostHeader)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      const requestOrigin = String(req.headers.origin || '');
      const isAllowedAuthBridgeOrigin = Boolean(
        activeAuthOrigin && requestOrigin === activeAuthOrigin
      );

      // Handle CORS + Private Network Access preflight only for the active Firebase authDomain bridge
      if (req.method === 'OPTIONS') {
        if (!isAllowedAuthBridgeOrigin) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }
        res.writeHead(204, {
          'Access-Control-Allow-Origin': activeAuthOrigin,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Private-Network': 'true',
          Vary: 'Origin',
        });
        res.end();
        return;
      }

      // Allow GET and HEAD only
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      let reqPath = '/';
      try {
        reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      const relativePath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      let filePath = path.resolve(distDir, relativePath);

      // Strict trailing-separator path traversal confinement
      if (filePath !== distDir && !filePath.startsWith(distDirPrefix)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const responseHeaders = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': CSP_POLICY,
      };

      if (isAllowedAuthBridgeOrigin) {
        responseHeaders['Access-Control-Allow-Origin'] = activeAuthOrigin;
        responseHeaders['Access-Control-Allow-Private-Network'] = 'true';
        responseHeaders.Vary = 'Origin';
      }

      res.writeHead(200, responseHeaders);

      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    });

    const onListening = () => {
      const address = server.address();
      boundPort = typeof address === 'object' && address ? address.port : LOCAL_APP_PORT;
      localAppServer = server;
      localAppUrl = `http://localhost:${boundPort}`;
      resolve(localAppUrl);
    };

    server.once('error', () => {
      // Fallback to an OS-assigned localhost port if preferred port is occupied
      server.listen(0, '127.0.0.1', onListening);
    });

    server.listen(LOCAL_APP_PORT, '127.0.0.1', onListening);
  });
}

function resolveBuiltBridgeAssets() {
  const indexHtmlPath = path.resolve(__dirname, '..', 'dist', 'index.html');
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const scriptMatch = html.match(
    /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i
  );
  const cssMatch = html.match(
    /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/i
  );

  if (!scriptMatch || !scriptMatch[1]) {
    throw new Error('Could not resolve desktop auth bridge bundle.');
  }

  const normalizeAssetPath = (rawPath) =>
    rawPath.replace(/^\.?\//, '').replace(/^\/+/, '');

  return {
    scriptPath: normalizeAssetPath(scriptMatch[1]),
    cssPath: cssMatch && cssMatch[1] ? normalizeAssetPath(cssMatch[1]) : null,
  };
}

function isBridgePageUrl(rawUrl, expectedOrigin) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin === expectedOrigin && parsed.pathname === AUTH_BRIDGE_PATH;
  } catch {
    return false;
  }
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function validateWebAuthUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    if (isPrivateOrLocalHostname(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function probeWebAuthUrl(urlString) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_AUTH_PROBE_TIMEOUT_MS);
  try {
    const response = await net.fetch(urlString, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    return (
      (response.status >= 200 && response.status < 400) ||
      response.status === 405
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function cancelActiveBrowserAuth(
  code = 'auth/popup-closed-by-user',
  message = 'Browser sign-in was canceled.'
) {
  if (!activeBrowserAuthSession) return;
  const sessionToCancel = activeBrowserAuthSession;
  activeBrowserAuthSession = null;
  sessionToCancel.cancel(code, message);
}

function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Opens Notely's hosted web relay page in the user's default system browser
 * (Chrome/Edge, where they are already signed into Google) and receives the
 * Google OAuth credential via a short-lived, state-protected 127.0.0.1 POST callback.
 */
function runSystemBrowserGoogleSignIn(parsedWebUrl) {
  cancelActiveBrowserAuth(
    'auth/cancelled-popup-request',
    'Replaced by a new sign-in request.'
  );

  const expectedOrigin = parsedWebUrl.origin;
  const expectedState = crypto.randomBytes(32).toString('hex');

  return new Promise((resolve) => {
    let settled = false;
    let boundPort = 0;
    let timeoutHandle = null;

    const cleanupAndResolve = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (activeBrowserAuthSession && activeBrowserAuthSession.state === expectedState) {
        activeBrowserAuthSession = null;
      }
      try {
        callbackServer.close();
      } catch {
        // Ignore close error
      }
      resolve(result);
    };

    const callbackServer = http.createServer((req, res) => {
      const hostHeader = String(req.headers.host || '').toLowerCase();
      if (hostHeader !== `127.0.0.1:${boundPort}`) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const requestOrigin = String(req.headers.origin || '');
      if (requestOrigin !== expectedOrigin) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const reqPath = (req.url || '').split('?')[0];
      if (reqPath !== '/auth/callback') {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const corsHeaders = {
        'Access-Control-Allow-Origin': expectedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        Vary: 'Origin',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      let rawBody = '';
      let byteLength = 0;
      let aborted = false;

      req.on('data', (chunk) => {
        if (aborted) return;
        byteLength += chunk.length;
        if (byteLength > MAX_AUTH_CALLBACK_BYTES) {
          aborted = true;
          res.writeHead(413, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify({ ok: false }));
          req.destroy();
          return;
        }
        rawBody += chunk.toString('utf8');
      });

      req.on('end', () => {
        if (aborted || settled) return;
        let payload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          res.writeHead(400, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify({ ok: false }));
          return;
        }

        if (!payload || !timingSafeMatch(payload.state, expectedState)) {
          res.writeHead(403, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify({ ok: false }));
          return;
        }

        const idToken =
          typeof payload.idToken === 'string' &&
          payload.idToken.length > 0 &&
          payload.idToken.length <= MAX_OAUTH_TOKEN_LENGTH
            ? payload.idToken
            : null;
        const accessToken =
          typeof payload.accessToken === 'string' &&
          payload.accessToken.length > 0 &&
          payload.accessToken.length <= MAX_OAUTH_TOKEN_LENGTH
            ? payload.accessToken
            : null;

        if (!idToken && !accessToken) {
          res.writeHead(400, {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify({ ok: false }));
          return;
        }

        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify({ ok: true }));

        // Automatically bring Notely back to the foreground after browser login
        showAndFocusWindow(false);

        cleanupAndResolve({
          ok: true,
          idToken,
          accessToken,
          usedMode: 'browser',
        });
      });
    });

    activeBrowserAuthSession = {
      state: expectedState,
      cancel: (code, message) => {
        cleanupAndResolve({
          ok: false,
          code,
          message,
          usedMode: 'browser',
        });
      },
    };

    callbackServer.once('error', () => {
      cleanupAndResolve({
        ok: false,
        code: 'auth/internal-error',
        message: 'Could not start local sign-in callback listener.',
        usedMode: 'browser',
      });
    });

    callbackServer.listen(0, '127.0.0.1', () => {
      const address = callbackServer.address();
      boundPort = typeof address === 'object' && address ? address.port : 0;
      if (!boundPort) {
        cleanupAndResolve({
          ok: false,
          code: 'auth/internal-error',
          message: 'Could not bind local sign-in callback port.',
          usedMode: 'browser',
        });
        return;
      }

      const launchUrl = new URL(parsedWebUrl.toString());
      launchUrl.searchParams.set('desktop_auth', '1');
      launchUrl.searchParams.set('callback_port', String(boundPort));
      launchUrl.searchParams.set('state', expectedState);

      timeoutHandle = setTimeout(() => {
        cleanupAndResolve({
          ok: false,
          code: 'auth/timeout',
          message: 'Browser sign-in timed out.',
          usedMode: 'browser',
        });
      }, AUTH_CALLBACK_TIMEOUT_MS);

      void shell.openExternal(launchUrl.toString()).catch(() => {
        cleanupAndResolve({
          ok: false,
          code: 'auth/internal-error',
          message: 'Could not open your default web browser.',
          usedMode: 'browser',
        });
      });
    });
  });
}

/**
 * Runs Google Sign-In inside an isolated BrowserWindow hosted on Firebase's
 * own always-authorized authDomain (https://<project>.firebaseapp.com), using
 * Chromium's native HTTPS stack with zero protocol interception. Once Google
 * OAuth completes, the bridge extracts the Google OAuth tokens and returns them
 * to the main window to call signInWithCredential().
 */
async function runBuiltInWindowGoogleSignIn(rawAuthDomain, fellBackToWindow = false) {
  const authDomain = typeof rawAuthDomain === 'string' ? rawAuthDomain.trim().toLowerCase() : '';
  if (!AUTH_DOMAIN_REGEX.test(authDomain)) {
    return {
      ok: false,
      code: 'auth/invalid-auth-domain',
      message: 'Invalid Firebase authDomain configuration.',
    };
  }

  if (activeAuthWindow && !activeAuthWindow.isDestroyed()) {
    activeAuthWindow.focus();
    return {
      ok: false,
      code: 'auth/cancelled-popup-request',
      message: 'A Google Sign-In window is already open.',
    };
  }

  let baseUrl;
  let assets;
  try {
    baseUrl = await startLocalAppServer();
    assets = resolveBuiltBridgeAssets();
  } catch (err) {
    return {
      ok: false,
      code: 'auth/internal-error',
      message: err instanceof Error ? err.message : 'Unable to start sign-in bridge.',
    };
  }

  const expectedOrigin = `https://${authDomain}`;
  const bridgeUrl = `${expectedOrigin}${AUTH_BRIDGE_PATH}?notely_auth_bridge=1`;
  const scriptUrl = `${baseUrl}/${assets.scriptPath}`;
  const cssUrl = assets.cssPath ? `${baseUrl}/${assets.cssPath}` : null;

  const authSession = session.fromPartition(AUTH_BRIDGE_PARTITION);
  try {
    await authSession.clearStorageData({
      storages: ['localstorage', 'indexdb', 'cachestorage'],
    });
  } catch {
    // Non-fatal if isolated partition is empty
  }

  activeAuthOrigin = expectedOrigin;

  return new Promise((resolve) => {
    let settled = false;

    const authWindow = new BrowserWindow({
      width: 500,
      height: 660,
      minWidth: 420,
      minHeight: 540,
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      modal: false,
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: false,
      autoHideMenuBar: true,
      backgroundColor: '#161618',
      title: 'Sign in with Google — Notely',
      icon: getIconPath(),
      webPreferences: {
        preload: path.join(__dirname, 'auth-preload.cjs'),
        partition: AUTH_BRIDGE_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    activeAuthWindow = authWindow;
    authWindow.webContents.setUserAgent(CHROME_USER_AGENT);

    const cleanupAndResolve = (result) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('auth:bridge-complete', onComplete);
      ipcMain.removeListener('auth:bridge-fail', onFail);
      if (activeAuthOrigin === expectedOrigin) {
        activeAuthOrigin = null;
      }
      if (activeAuthWindow === authWindow) {
        activeAuthWindow = null;
      }
      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }
      resolve(result);
    };

    const isTrustedBridgeSender = (event) => {
      if (authWindow.isDestroyed() || event.sender !== authWindow.webContents) {
        return false;
      }
      const frameUrl = event.senderFrame?.url || authWindow.webContents.getURL();
      return isBridgePageUrl(frameUrl, expectedOrigin);
    };

    const onComplete = (event, payload) => {
      if (!isTrustedBridgeSender(event)) return;
      const idToken =
        payload &&
        typeof payload.idToken === 'string' &&
        payload.idToken.length > 0 &&
        payload.idToken.length <= MAX_OAUTH_TOKEN_LENGTH
          ? payload.idToken
          : null;
      const accessToken =
        payload &&
        typeof payload.accessToken === 'string' &&
        payload.accessToken.length > 0 &&
        payload.accessToken.length <= MAX_OAUTH_TOKEN_LENGTH
          ? payload.accessToken
          : null;

      if (!idToken && !accessToken) {
        cleanupAndResolve({
          ok: false,
          code: 'auth/internal-error',
          message: 'Google Sign-In did not return a valid OAuth token.',
        });
        return;
      }

      cleanupAndResolve({
        ok: true,
        idToken,
        accessToken,
        usedMode: 'window',
        fellBackToWindow,
      });
    };

    const onFail = (event, error) => {
      if (!isTrustedBridgeSender(event)) return;
      cleanupAndResolve({
        ok: false,
        code:
          error && typeof error.code === 'string'
            ? error.code
            : 'auth/internal-error',
        message:
          error && typeof error.message === 'string'
            ? error.message
            : 'Google Sign-In failed.',
      });
    };

    ipcMain.on('auth:bridge-complete', onComplete);
    ipcMain.on('auth:bridge-fail', onFail);

    // Restrict auth window navigation strictly to HTTPS OAuth endpoints
    authWindow.webContents.on('will-navigate', (event, targetUrl) => {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'https:') {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });

    // Open external help/privacy links in the default system browser
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // Mount Notely's lightweight auth bridge bundle whenever the window lands on our bridge path
    authWindow.webContents.on('dom-ready', () => {
      if (settled || authWindow.isDestroyed()) return;
      const currentUrl = authWindow.webContents.getURL();
      if (isBridgePageUrl(currentUrl, expectedOrigin)) {
        const bootstrapCode = `(() => {
          document.title = 'Sign in with Google — Notely';
          document.documentElement.className = 'dark';
          document.head.innerHTML = '<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>html,body{margin:0;padding:0;background:#161618;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}</style>';
          document.body.innerHTML = '<div id="root"><div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;"><div style="width:34px;height:34px;border-radius:50%;border:2px solid rgba(76,194,255,0.25);border-top-color:#4CC2FF;animation:notelySpin .8s linear infinite;"></div><div style="font-size:14px;font-weight:500;">Connecting to Google Sign-In...</div></div></div><style>@keyframes notelySpin{to{transform:rotate(360deg)}}</style>';
          const cssHref = ${JSON.stringify(cssUrl)};
          if (cssHref) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.crossOrigin = 'anonymous';
            link.href = cssHref;
            document.head.appendChild(link);
          }
          const script = document.createElement('script');
          script.type = 'module';
          script.crossOrigin = 'anonymous';
          script.src = ${JSON.stringify(scriptUrl)};
          script.onerror = () => {
            if (window.notelyAuthBridge) {
              window.notelyAuthBridge.fail({
                code: 'auth/network-request-failed',
                message: 'Could not initialize the desktop sign-in bridge.',
              });
            }
          };
          document.head.appendChild(script);
        })();`;

        void authWindow.webContents
          .executeJavaScript(bootstrapCode, true)
          .then(() => {
            if (!settled && !authWindow.isDestroyed() && !authWindow.isVisible()) {
              authWindow.show();
              authWindow.focus();
            }
          })
          .catch(() => {
            cleanupAndResolve({
              ok: false,
              code: 'auth/internal-error',
              message: 'Could not initialize the desktop sign-in window.',
            });
          });
      } else if (!authWindow.isVisible()) {
        authWindow.show();
        authWindow.focus();
      }
    });

    authWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
        // Ignore ERR_ABORTED (-3) triggered normally during OAuth redirects
        if (!isMainFrame || errorCode === -3) return;
        cleanupAndResolve({
          ok: false,
          code: 'auth/network-request-failed',
          message:
            errorDescription ||
            'Could not reach Google Sign-In. Check your internet connection.',
        });
      }
    );

    authWindow.on('closed', () => {
      cleanupAndResolve({
        ok: false,
        code: 'auth/popup-closed-by-user',
        message: 'Sign-in window was closed.',
      });
    });

    void authWindow.loadURL(bridgeUrl).catch((err) => {
      if (err && typeof err.code === 'string' && err.code === 'ERR_ABORTED') {
        return;
      }
      cleanupAndResolve({
        ok: false,
        code: 'auth/network-request-failed',
        message: 'Could not open Google Sign-In. Check your internet connection.',
      });
    });
  });
}

async function runDesktopGoogleSignIn(requestOrDomain) {
  const authDomain =
    typeof requestOrDomain === 'string'
      ? requestOrDomain
      : requestOrDomain && typeof requestOrDomain.authDomain === 'string'
        ? requestOrDomain.authDomain
        : '';
  const requestedMode =
    requestOrDomain &&
    typeof requestOrDomain === 'object' &&
    requestOrDomain.mode === 'window'
      ? 'window'
      : 'browser';
  const rawWebUrl =
    process.env.NOTELY_WEB_AUTH_URL ||
    (requestOrDomain && typeof requestOrDomain.webAuthUrl === 'string'
      ? requestOrDomain.webAuthUrl
      : '') ||
    DEFAULT_WEB_AUTH_URL;

  if (requestedMode === 'window') {
    cancelActiveBrowserAuth(
      'auth/cancelled-popup-request',
      'Switched to built-in sign-in window.'
    );
    return runBuiltInWindowGoogleSignIn(authDomain, false);
  }

  const parsedWebUrl = validateWebAuthUrl(rawWebUrl);
  if (parsedWebUrl) {
    const isReachable = await probeWebAuthUrl(parsedWebUrl.toString());
    if (isReachable) {
      return runSystemBrowserGoogleSignIn(parsedWebUrl);
    }
  }

  // Automatic fallback to persistent built-in window if hosted web relay is unavailable
  return runBuiltInWindowGoogleSignIn(authDomain, true);
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

/**
 * Encrypts workspace JSON at rest using the OS native credential store
 * (Windows DPAPI via Electron safeStorage) when available.
 */
function encodeWorkspaceForDisk(jsonString) {
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const encryptedBuf = safeStorage.encryptString(jsonString);
      return JSON.stringify({
        __notelyEncrypted: DPAPI_ENVELOPE_FORMAT,
        data: encryptedBuf.toString('base64'),
      });
    }
  } catch {
    // Fall back to plaintext JSON if OS credential store is unavailable
  }
  return jsonString;
}

/**
 * Transparently decrypts DPAPI-encrypted workspace.json files while remaining
 * backward-compatible with older plaintext workspace.json files.
 */
function decodeWorkspaceFromDisk(rawString) {
  try {
    const parsed = JSON.parse(rawString);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.__notelyEncrypted === DPAPI_ENVELOPE_FORMAT &&
      typeof parsed.data === 'string'
    ) {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(parsed.data, 'base64'));
      }
      return null;
    }
  } catch {
    // Return raw content for caller validation
  }
  return rawString;
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
    const decoded = decodeWorkspaceFromDisk(raw);
    if (!decoded) {
      throw new Error('Encrypted workspace unavailable before ready');
    }
    const parsed = JSON.parse(decoded);
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
      height: 38,
    };
  }
  const mode = themeInput === 'dark' ? 'dark' : 'light';
  const fallback = PRESET_FRAME_OVERLAYS.default[mode];
  return {
    color: fallback.color,
    symbolColor: fallback.symbolColor,
    height: 38,
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

  // Allow Firebase/Google OAuth popups (including initial about:blank pre-open); open other links in default browser
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

  // Harden Firebase/Google OAuth popup windows while permitting Google + SSO HTTPS redirects
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    childWindow.webContents.setUserAgent(CHROME_USER_AGENT);
    childWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (!targetUrl || targetUrl === 'about:blank') return;
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'https:') {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });
    childWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  });

  // Lock main window navigation to Notely's own local origin only
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      const isLocalOrigin =
        (parsed.protocol === 'http:' &&
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) ||
        parsed.protocol === 'file:';
      if (!isLocalOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
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
      const raw = fs.readFileSync(filePath, 'utf8');
      return decodeWorkspaceFromDisk(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle('workspace:save', (_event, jsonString) => {
    if (
      typeof jsonString !== 'string' ||
      Buffer.byteLength(jsonString, 'utf8') > MAX_WORKSPACE_BYTES
    ) {
      return false;
    }
    try {
      atomicWriteJson(getWorkspaceFilePath(), encodeWorkspaceForDisk(jsonString));
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
    if (
      !mainWindow ||
      typeof jsonString !== 'string' ||
      Buffer.byteLength(jsonString, 'utf8') > MAX_WORKSPACE_BYTES
    ) {
      return { canceled: true };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Notely Workspace Backup',
      defaultPath: String(defaultFilename || 'notely-backup.json'),
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
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_WORKSPACE_BYTES) {
      return { canceled: true };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { canceled: false, filePath, content };
  });

  ipcMain.handle('auth:googleSignIn', (_event, requestOrDomain) =>
    runDesktopGoogleSignIn(requestOrDomain)
  );

  ipcMain.handle('auth:cancelGoogleSignIn', () => {
    cancelActiveBrowserAuth(
      'auth/popup-closed-by-user',
      'Browser sign-in was canceled.'
    );
  });
}

app.on('second-instance', () => {
  showAndFocusWindow(false);
});

app.on('open-url', (event) => {
  event.preventDefault();
  showAndFocusWindow(false);
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.notely.desktop');
  if (app.isPackaged) {
    try {
      app.setAsDefaultProtocolClient('notely');
    } catch {
      // Non-fatal if OS protocol registration is restricted
    }
  }
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
  cancelActiveBrowserAuth('auth/popup-closed-by-user', 'Application quitting.');
  if (activeAuthWindow && !activeAuthWindow.isDestroyed()) {
    try {
      activeAuthWindow.close();
    } catch {
      // Ignore close error on exit
    }
    activeAuthWindow = null;
  }
  activeAuthOrigin = null;
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
