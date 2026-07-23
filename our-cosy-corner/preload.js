// Bridges a tiny, safe surface from the Electron main process to the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cosyBridge', {
  isElectron: true,
  // Supabase OAuth loopback relay — called in this order by storage.js:
  // 1) oauthGetPort() starts the loopback server, returns { port } so the
  //    renderer can build redirectTo before calling signInWithOAuth.
  // 2) oauthOpen(url) opens the Supabase authorize URL in the system browser.
  // 3) oauthWaitForCode() resolves { code } once the loopback is hit (or
  //    rejects on error/timeout/no-active-flow).
  oauthGetPort: () => ipcRenderer.invoke('oauth-get-port'),
  oauthOpen: (url) => ipcRenderer.invoke('oauth-open', url),
  oauthWaitForCode: () => ipcRenderer.invoke('oauth-wait-for-code'),
  // Files (pdf/file blocks): save bytes under cosy-files, open externally,
  // or read bytes back for the inline PDF viewer.
  saveFile: (name, arrayBuffer) => ipcRenderer.invoke('file-save', { name: name, bytes: new Uint8Array(arrayBuffer) }),
  openFile: (path) => ipcRenderer.invoke('file-open', path),
  readFile: (path) => ipcRenderer.invoke('file-read', path),
  // Diagnostics: a rolling log file under userData/logs so a bug report can
  // include a real file instead of a devtools screenshot.
  appendLog: (line) => ipcRenderer.invoke('log-append', line),
  logPath: () => ipcRenderer.invoke('log-path'),
  // Auto-update: main.js pushes 'update-status' events ({ state: 'available'
  // | 'downloading' | 'ready' | 'none' | 'error', ... }); updateCheck() asks
  // it to look now, updateGet() starts the platform-appropriate next step
  // (download on Windows, open the releases page on Mac), updateInstall()
  // quits and installs an already-downloaded update.
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_evt, payload) => cb(payload)),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateGet: () => ipcRenderer.invoke('update-get'),
  updateInstall: () => ipcRenderer.invoke('update-install')
});
