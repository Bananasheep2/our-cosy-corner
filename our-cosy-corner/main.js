// Our Cosy Corner — Electron main process
// Creates the window and provides a reliable Google sign-in path for Electron
// via a system-browser OAuth loopback (signInWithPopup is unreliable in Electron).
//
// With Supabase Auth, Supabase itself is the registered OAuth client with
// Google (configured in the Supabase dashboard) — this process never talks
// to Google's OAuth/token endpoints and never sees Google credentials. Its
// job shrinks to plumbing: run a local loopback HTTP server, tell the
// renderer what port it's listening on, let the renderer (via supabase-js,
// which generates and stores its own PKCE verifier) build the Supabase
// authorize URL pointing `redirectTo` at that port, open that URL in the
// system browser, and capture the `?code=` (or `?error=`) that SUPABASE's
// own redirect appends back to http://127.0.0.1:<port>. The `{code}` is
// handed back to the renderer, which finishes the exchange itself via
// supabase-js's exchangeCodeForSession — main.js never sees a token.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

let mainWindow = null;

// Where mac users are sent to grab a new version by hand — keep in sync with
// the download page on the site, since mac can't self-install while unsigned
// (see initAutoUpdater below).
const UPDATE_RELEASES_URL = 'https://ourcosycorner.com/download';

// A tiny release manifest the app polls on launch — separate from the
// electron-updater latest*.yml because it carries two things the yml can't:
// whether an update is CRITICAL (force it), and the human feature list the
// update overlay shows. Fetched in the MAIN process (Node https, no renderer
// CSP to satisfy) and pushed to the window via the existing update-status
// channel. Editing this file on the site changes the prompt for every client
// without shipping a new build.
const RELEASE_INFO_URL = 'https://ourcosycorner.com/release-info.json';

// Numeric-dotted version compare (1.0.10 > 1.0.9). Returns -1/0/1. Anything
// unparseable sorts low so a malformed value never blocks the app.
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Resolve the release manifest, or null on any failure (offline, 404, bad
// JSON, timeout) — a broken manifest must never wedge startup.
function fetchReleaseInfo() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = https.get(RELEASE_INFO_URL, { timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return finish(null); }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
        res.on('end', () => { try { finish(JSON.parse(body)); } catch (_) { finish(null); } });
      });
      req.on('error', () => finish(null));
      req.on('timeout', () => { req.destroy(); finish(null); });
    } catch (_) { finish(null); }
  });
}

// ---------------------------------------------------------------------------
// Single instance: a couples app has no business running twice at once —
// a second launch (double-click, dock icon, etc.) just focuses the window
// that's already open instead of spawning a second copy that would fight
// over the same local storage / OAuth loopback ports.
//
// Startup gate: a test harness that `require()`s this file in-process (to
// reach the pure helpers / ipcMain handlers below) must set
// process.env.COSY_MAIN_AS_LIBRARY = '1' BEFORE requiring, which skips the
// lock/window bootstrapping. A real launch (`electron .` / packaged app)
// never sets it. Do NOT "simplify" this back to `require.main === module`:
// on Electron ≥28 the app entry is loaded by Electron's own bootstrapper
// (require.main.filename === 'electron'), so that check is ALWAYS false at
// real launch — the app booted with no window at all.
// ---------------------------------------------------------------------------
const runAsApp = !process.env.COSY_MAIN_AS_LIBRARY;
if (runAsApp) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#f6ede1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 20 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');

  // Let a user open DevTools to read diagnostics when something misbehaves —
  // Cmd/Ctrl+Alt+I or F12. Handled here (main) via before-input-event rather
  // than a renderer shortcut so it works even with the sandbox on and no
  // application menu. Read-only escape hatch; it never changes app behaviour.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const toggle = key === 'f12' || (input.alt && (input.meta || input.control) && key === 'i');
    if (toggle) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }

    // Explicit zoom handling: Windows users have no menu bar for the zoom
    // roles (autoHideMenuBar) and the default accelerator misses the plain
    // Ctrl+= chord anyway, so we wire the shortcuts up ourselves here.
    if ((input.meta || input.control) && !input.alt) {
      if (key === '=' || key === '+' || input.code === 'NumpadAdd') {
        mainWindow.webContents.setZoomLevel(Math.min(3, mainWindow.webContents.getZoomLevel() + 0.5));
        event.preventDefault();
      } else if (key === '-' || input.code === 'NumpadSubtract') {
        mainWindow.webContents.setZoomLevel(Math.max(-2, mainWindow.webContents.getZoomLevel() - 0.5));
        event.preventDefault();
      } else if (key === '0' || input.code === 'Numpad0') {
        mainWindow.webContents.setZoomLevel(0);
        event.preventDefault();
      }
    }
  });

  // The app's one legitimate origin — the packaged index.html. Anything the
  // renderer tries to navigate the window itself to (a compromised link, a
  // script bug) that isn't this file gets blocked; external links are handled
  // separately below via setWindowOpenHandler / window.open.
  const appUrl = require('url').pathToFileURL(path.join(__dirname, 'index.html')).toString();
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== appUrl) event.preventDefault();
  });

  // Open external links in the user's real browser, never in-app. Default
  // DENY: only http(s) URLs get routed out via shell.openExternal; every
  // other scheme (file:, javascript:, custom schemes, etc.) is refused
  // outright rather than allowed to open a new in-app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Quit-time flush: the renderer listens for beforeunload and flushes any
  // debounced saves / the focused editor there. Give it a short, bounded
  // moment to do that before the window (and its process) actually goes
  // away, instead of tearing it down instantly on the first close click.
  let flushGiven = false;
  mainWindow.on('close', (event) => {
    if (!flushGiven && mainWindow && !mainWindow.webContents.isDestroyed()) {
      flushGiven = true;
      event.preventDefault();
      setTimeout(() => {
        if (mainWindow) mainWindow.destroy();
      }, 200);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------------------------------------------------------------------
// Files: save / open / read (pdf + file blocks). Everything lives in one
// folder under userData so path validation is a simple "is it inside this
// folder" check — no arbitrary filesystem reads/writes from the renderer.
// ---------------------------------------------------------------------------
function cosyFilesDir() {
  return path.join(app.getPath('userData'), 'cosy-files');
}

function ensureCosyFilesDir() {
  const dir = cosyFilesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Keeps the original name recognisable while stripping anything that could
// escape the folder (path separators, etc.) or confuse a filesystem.
function sanitiseFileName(name) {
  let base = String(name || 'file').replace(/[\\/?%*:|"<>]/g, '-').trim();
  base = base.replace(/^\.+/, '').slice(-180);
  return base || 'file';
}

// True when `candidate` resolves to a path inside cosy-files (no `..` escape,
// no symlink-style traversal via string tricks).
function isInsideCosyFiles(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  const dir = path.resolve(cosyFilesDir());
  const resolved = path.resolve(candidate);
  return resolved === dir || resolved.startsWith(dir + path.sep);
}

ipcMain.handle('file-save', (_evt, payload) => {
  const name = (payload && payload.name) || 'file';
  const bytes = (payload && payload.bytes) || [];
  const dir = ensureCosyFilesDir();
  const finalName = Date.now() + '-' + sanitiseFileName(name);
  const dest = path.join(dir, finalName);
  const buf = Buffer.from(bytes);
  fs.writeFileSync(dest, buf);
  return { path: dest, size: buf.length };
});

ipcMain.handle('file-open', (_evt, filePath) => {
  if (!isInsideCosyFiles(filePath)) {
    throw new Error('That file lives outside our cosy folder, so I can\'t open it.');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error('missing-file');
  }
  return shell.openPath(filePath);
});

ipcMain.handle('file-read', (_evt, filePath) => {
  if (!isInsideCosyFiles(filePath)) {
    throw new Error('That file lives outside our cosy folder, so I can\'t read it.');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error('missing-file');
  }
  return fs.readFileSync(filePath);
});

// ---------------------------------------------------------------------------
// Supabase OAuth loopback relay (runs in the system browser).
// Supabase is the registered OAuth client with Google, so this process only
// needs to: (1) listen on a loopback port so the renderer can build a
// `redirectTo` pointing at it, (2) open the Supabase authorize URL the
// renderer hands us in the system browser, and (3) capture the `code`
// (or `error`) query param Supabase's own redirect appends back to us.
//
// Fixed port, not ephemeral: unlike Google's raw OAuth2 endpoint (which
// accepted any 127.0.0.1 port as a loopback redirect), Supabase Auth's
// redirect-URL allow-list matches on the full URL and its wildcard support
// is documented for path segments, not for the port number itself. So one
// exact port is registered once in the Supabase dashboard (see SETUP.md)
// and reused every sign-in, with a short list of fallback ports in the rare
// case the first is already taken on this Mac.
// Three IPC methods, called in this exact order by the renderer:
//   oauth-get-port      → starts the loopback server, returns { port }
//   oauth-open           → shell.openExternal(url), fire and forget
//   oauth-wait-for-code  → resolves { code } once the server is hit, or
//                          rejects on ?error=... / timeout / no active flow
// ---------------------------------------------------------------------------
const OAUTH_LOOPBACK_PORTS = [53682, 53683, 53684];

// Friendly pages served on the loopback response — fully self-contained
// (no external CSS/JS/fonts/images) since they're served from a throwaway
// localhost server and must render instantly offline.
const OAUTH_PAGE_STYLE = `
    :root {
      --bg: #eee2df; --bg-2: #ecdcd2; --panel: #faf3f1; --panel-2: #eed7c5;
      --ink: #4a322c; --ink-soft: #7f584e; --accent: #9e5a4f; --accent-soft: #c89f9c;
      --line: #e0cbc4; --terracotta: #c67b5c; --emblem-ink: #faf3f1;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #241a1c; --bg-2: #2e2022; --panel: #332326; --panel-2: #412d2c;
        --ink: #f3e5e0; --ink-soft: #c8a89f; --accent: #d08a76; --accent-soft: #6b4842;
        /* --emblem-ink stays light here: the dark-mode emblem circle is a
           deep brown, so a panel-coloured tick would vanish into it. */
        --line: #4b3533; --terracotta: #c67b5c; --emblem-ink: #f7ece8;
      }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; min-height: 100vh;
      background: var(--bg);
      background-image:
        radial-gradient(rgba(74,50,44,0.04) 1px, transparent 1px);
      background-size: 22px 22px;
    }
    body {
      position: relative;
      min-height: 100vh;
      display: grid;
      place-items: center;
      overflow: hidden;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    .glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(70px);
      pointer-events: none;
      z-index: 0;
    }
    .glow-a {
      width: 380px; height: 380px;
      top: -140px; left: -120px;
      background: var(--accent-soft);
      opacity: 0.35;
    }
    .glow-b {
      width: 420px; height: 420px;
      bottom: -160px; right: -140px;
      background: var(--panel-2);
      opacity: 0.45;
    }
    .glyph {
      position: absolute;
      color: var(--accent);
      opacity: 0.25;
      font-size: 22px;
      z-index: 0;
      animation: float 8s ease-in-out infinite alternate;
    }
    .glyph-1 { top: 14%; left: 12%; font-size: 26px; animation-duration: 8s; animation-delay: -1s; }
    .glyph-2 { top: 22%; right: 14%; font-size: 18px; animation-duration: 7s; animation-delay: -3s; }
    .glyph-3 { bottom: 18%; left: 16%; font-size: 20px; animation-duration: 9s; animation-delay: -5s; }
    .glyph-4 { bottom: 12%; right: 12%; font-size: 24px; animation-duration: 7.5s; animation-delay: -2s; }
    @keyframes float {
      from { transform: translateY(-8px) rotate(-4deg); }
      to { transform: translateY(8px) rotate(4deg); }
    }
    .card {
      position: relative;
      z-index: 1;
      width: min(440px, calc(100% - 40px));
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 48px 44px;
      box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 28px 60px -28px rgba(74,50,44,.28);
      text-align: center;
      animation: card-in .6s cubic-bezier(.2,.7,.25,1) both;
    }
    @keyframes card-in {
      from { opacity: 0; transform: translateY(18px) scale(.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .emblem {
      width: 84px; height: 84px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      margin: 0 auto 24px;
      animation: emblem-pop .5s cubic-bezier(.2,.7,.25,1) .15s both;
    }
    @keyframes emblem-pop {
      from { opacity: 0; transform: scale(.6); }
      to { opacity: 1; transform: scale(1); }
    }
    .emblem-success { background: var(--accent-soft); }
    .emblem-cancelled { background: var(--panel-2); }
    .emblem svg {
      width: 36px; height: 36px;
    }
    .check-path {
      stroke-dasharray: 40;
      stroke-dashoffset: 40;
      animation: draw-check .6s ease-out .5s forwards;
    }
    @keyframes draw-check {
      to { stroke-dashoffset: 0; }
    }
    .moon-icon {
      font-size: 34px;
      line-height: 1;
    }
    h1 {
      margin: 0 0 10px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 30px;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .lede {
      margin: 0 0 24px;
      font-size: 15px;
      line-height: 1.55;
      color: var(--ink-soft);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: var(--panel-2);
      border-radius: 999px;
      padding: 12px 20px;
      font-size: 13.5px;
      color: var(--ink);
      text-align: left;
    }
    .pill svg { flex: none; width: 16px; height: 16px; }
    .footer {
      margin-top: 28px;
      font-size: 12px;
      letter-spacing: .3px;
      color: var(--accent);
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; }
      .check-path { stroke-dashoffset: 0; }
      .card, .emblem { opacity: 1; transform: none; }
    }
`;

const OAUTH_SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You're in — Our Cosy Corner</title>
<style>${OAUTH_PAGE_STYLE}</style>
</head>
<body>
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>
  <span class="glyph glyph-1">&#10022;</span>
  <span class="glyph glyph-2">&#10022;</span>
  <span class="glyph glyph-3">&#10047;</span>
  <span class="glyph glyph-4">&#10022;</span>
  <div class="card">
    <div class="emblem emblem-success">
      <svg viewBox="0 0 36 36" fill="none">
        <path class="check-path" d="M9 19l6 6 12-14" stroke="var(--emblem-ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>You're in</h1>
    <p class="lede">Your cosy corner is ready and waiting.</p>
    <div class="pill">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/></svg></span>
      <span>Close this tab and head back to the app</span>
    </div>
    <div class="footer">Our Cosy Corner</div>
  </div>
  <script>
    setTimeout(() => { try { window.close(); } catch (e) {} }, 4000);
  </script>
</body>
</html>`;

const OAUTH_CANCELLED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signed out for now — Our Cosy Corner</title>
<style>${OAUTH_PAGE_STYLE}</style>
</head>
<body>
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>
  <span class="glyph glyph-1">&#10022;</span>
  <span class="glyph glyph-2">&#10022;</span>
  <span class="glyph glyph-3">&#10047;</span>
  <span class="glyph glyph-4">&#10022;</span>
  <div class="card">
    <div class="emblem emblem-cancelled">
      <span class="moon-icon">&#127769;</span>
    </div>
    <h1>Signed out for now</h1>
    <p class="lede">No harm done — you can try signing in again whenever you like.</p>
    <div class="pill">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/></svg></span>
      <span>Close this tab and head back to the app</span>
    </div>
    <div class="footer">Our Cosy Corner</div>
  </div>
  <script>
    setTimeout(() => { try { window.close(); } catch (e) {} }, 4000);
  </script>
</body>
</html>`;

// Single in-flight OAuth flow's state: { server, pending, result, timeoutHandle }.
// `pending` is the {resolve, reject} of an in-flight oauth-wait-for-code call
// (if any); `result` holds a delivered-but-not-yet-collected outcome when the
// loopback is hit before oauth-wait-for-code has been called.
let oauthState = null;

function deliverOAuthResult(state, type, value) {
  if (state.timeoutHandle) { clearTimeout(state.timeoutHandle); state.timeoutHandle = null; }
  if (state.pending) {
    const pending = state.pending;
    state.pending = null;
    if (type === 'code') pending.resolve(value);
    else pending.reject(value);
  } else {
    state.result = { type, value };
  }
}

ipcMain.handle('oauth-get-port', () => {
  // Only one sign-in flow at a time — tear down any stale previous one.
  if (oauthState && oauthState.server) {
    try { oauthState.server.close(); } catch (_) {}
    if (oauthState.timeoutHandle) clearTimeout(oauthState.timeoutHandle);
  }

  return new Promise((resolve, reject) => {
    const state = { server: null, pending: null, result: null, timeoutHandle: null };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
        res.writeHead(404); res.end(); return;
      }
      const finish = (html) => {
        // charset MUST be declared here: Node writes the page as UTF-8, and a
        // bare `text/html` lets the browser fall back to latin-1 and mangle
        // every multi-byte character and em dash (rendered as mojibake).
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        server.close();
        state.server = null;
      };
      if (url.searchParams.get('error')) {
        const desc = url.searchParams.get('error_description') || url.searchParams.get('error');
        finish(OAUTH_CANCELLED_HTML);
        deliverOAuthResult(state, 'error', new Error(desc));
        return;
      }
      finish(OAUTH_SUCCESS_HTML);
      deliverOAuthResult(state, 'code', { code: url.searchParams.get('code') });
    });

    // Try the fixed candidate ports in order (almost always the first one).
    let attempt = 0;
    function tryListen() {
      const port = OAUTH_LOOPBACK_PORTS[attempt];
      const onError = (err) => {
        server.removeListener('error', onError);
        attempt += 1;
        if (err.code === 'EADDRINUSE' && attempt < OAUTH_LOOPBACK_PORTS.length) {
          tryListen();
        } else {
          reject(new Error('Could not open a sign-in window (no free port). Please try again.'));
        }
      };
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', onError);
        state.server = server;
        // Give up politely after 5 minutes, matching the old flow's timeout.
        state.timeoutHandle = setTimeout(() => {
          try { server.close(); } catch (_) {}
          state.server = null;
          deliverOAuthResult(state, 'error', new Error('Sign-in timed out.'));
        }, 5 * 60 * 1000);
        oauthState = state;
        resolve({ port });
      });
    }
    tryListen();
  });
});

// Pure and dependency-free on purpose, so it can be exercised directly in
// tests without booting the rest of the app: only an https URL whose host
// is (or ends in) `.supabase.co` — our own hosted project's domain — may be
// opened externally through this channel. This keeps a compromised renderer
// from turning oauth-open into an "open literally anything" primitive (other
// schemes like file:/javascript:, other hosts, IP literals, etc.).
function isAllowedOauthUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return parsed.hostname === 'supabase.co' || parsed.hostname.endsWith('.supabase.co');
}

ipcMain.handle('oauth-open', (_evt, url) => {
  if (!isAllowedOauthUrl(url)) {
    throw new Error('That sign-in link does not look right, so I will not open it — please try again.');
  }
  shell.openExternal(url);
});

ipcMain.handle('oauth-wait-for-code', () => {
  const state = oauthState;
  if (!state || !state.server) {
    return Promise.reject(new Error('No sign-in is in progress — please try again.'));
  }
  if (state.result) {
    const r = state.result;
    state.result = null;
    return r.type === 'code' ? Promise.resolve(r.value) : Promise.reject(r.value);
  }
  return new Promise((resolve, reject) => {
    state.pending = { resolve, reject };
  });
});

// ---------------------------------------------------------------------------
// Diagnostics log: a small rolling file the renderer's in-memory ring buffer
// (app.js) can flush to, so a partner who hits a bug can hand over a file
// instead of a screenshot of devtools. Capped at ~1MB by truncating the
// oldest content once it grows past that, so it never becomes its own
// storage problem.
// ---------------------------------------------------------------------------
const LOG_MAX_BYTES = 1024 * 1024;

function cosyLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'cosy.log');
}

function ensureCosyLogFile() {
  const file = cosyLogPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

ipcMain.handle('log-append', (_evt, line) => {
  const file = ensureCosyLogFile();
  const text = String(line == null ? '' : line).replace(/[\r\n]+$/, '') + '\n';
  fs.appendFileSync(file, text, 'utf8');
  try {
    const stat = fs.statSync(file);
    if (stat.size > LOG_MAX_BYTES) {
      // Truncate the oldest content: keep only the newest ~half of the cap
      // so the file doesn't immediately creep back over the limit.
      const buf = fs.readFileSync(file);
      const trimmed = buf.subarray(buf.length - Math.floor(LOG_MAX_BYTES / 2));
      const nlIndex = trimmed.indexOf(10); // start on a clean line boundary
      fs.writeFileSync(file, nlIndex >= 0 ? trimmed.subarray(nlIndex + 1) : trimmed);
    }
  } catch (_) { /* best-effort cap — never let logging itself throw */ }
  return true;
});

ipcMain.handle('log-path', () => cosyLogPath());

// ---------------------------------------------------------------------------
// Auto-update. Windows ships NSIS-installed, so electron-updater can download
// and silently install a new build there. macOS ships ad-hoc signed (not
// Developer-ID signed + notarized — see SHIP-CHECKLIST.md Part D), and
// electron-updater refuses to install a new version into an app it can't
// verify, so on darwin we only ever notify and hand the user off to the
// GitHub releases page in their real browser. The mac zip target + resulting
// latest-mac.yml are already produced by every build (see package.json), so
// this flips to full in-app auto-install on mac with no further code changes
// the day the app gets a real Developer ID cert.
// ---------------------------------------------------------------------------
let updaterRef = null;

function initAutoUpdater() {
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  updaterRef = autoUpdater;

  function sendUpdate(payload) {
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('update-status', payload);
    }
  }

  autoUpdater.on('update-available', (info) => sendUpdate({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    console.error('[Cosy] updater error:', err);
    sendUpdate({ state: 'error' });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 10000);
  setInterval(check, 4 * 60 * 60 * 1000);

  // Alongside the yml-based check, poll the release manifest for the CRITICAL
  // flag + feature list and drive the overlay from it. Runs on launch and
  // every 4h. checkForUpdates() above still primes electron-updater so the
  // Windows "Update" button can differential-download; on mac the button just
  // opens the download page (unsigned builds can't self-install).
  const checkReleaseInfo = () => fetchReleaseInfo().then((info) => {
    if (!info || !info.version) return;
    const current = app.getVersion();
    if (compareVersions(info.version, current) <= 0) return; // already current
    const critical = info.critical === true ||
      (info.minSupported && compareVersions(current, info.minSupported) < 0);
    sendUpdate({
      state: 'available',
      version: info.version,
      critical: !!critical,
      title: info.title || 'A new version is available',
      features: Array.isArray(info.features) ? info.features.slice(0, 6) : [],
      canInstall: process.platform !== 'darwin'
    });
  });
  setTimeout(checkReleaseInfo, 3000);
  setInterval(checkReleaseInfo, 4 * 60 * 60 * 1000);
}

ipcMain.handle('update-check', () => {
  if (!updaterRef) return false;
  return updaterRef.checkForUpdates().then(() => true).catch(() => false);
});

ipcMain.handle('update-get', () => {
  if (process.platform === 'darwin') {
    shell.openExternal(UPDATE_RELEASES_URL);
    return { mode: 'browser' };
  }
  if (updaterRef) updaterRef.downloadUpdate().catch(() => {});
  return { mode: 'download' };
});

ipcMain.handle('update-install', () => {
  if (!updaterRef) return false;
  setImmediate(() => updaterRef.quitAndInstall());
  return true;
});

if (runAsApp) {
  app.whenReady().then(() => {
    createWindow();
    initAutoUpdater();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// Exposed only for in-process test harnesses (`require('./main.js')` from a
// script also run under Electron's main process) to exercise pure helpers
// directly; unused by the app itself at runtime.
module.exports = { isAllowedOauthUrl, cosyLogPath };
