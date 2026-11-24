const { contextBridge, ipcRenderer } = require('electron');

// Only expose the sign-in bridge API on Notely's dedicated auth bridge path
if (window.location && window.location.pathname === '/__notely_auth_bridge__') {
  contextBridge.exposeInMainWorld('notelyAuthBridge', {
    complete: (payload) => {
      if (!payload || typeof payload !== 'object') return;
      ipcRenderer.send('auth:bridge-complete', {
        idToken: typeof payload.idToken === 'string' ? payload.idToken : null,
        accessToken:
          typeof payload.accessToken === 'string' ? payload.accessToken : null,
      });
    },
    fail: (error) => {
      ipcRenderer.send('auth:bridge-fail', {
        code:
          error && typeof error.code === 'string'
            ? error.code
            : 'auth/popup-closed-by-user',
        message:
          error && typeof error.message === 'string'
            ? error.message
            : 'Sign-in did not complete.',
      });
    },
  });
}
