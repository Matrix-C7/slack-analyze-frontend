'use strict';
// Slack Analyze desktop app: wraps the web dashboard in a native window with OS notifications, an unread badge on the
// taskbar button / dock and a tray icon. The dashboard itself is loaded from its server (local dev or the deployment).
const { app, BrowserWindow, Menu, clipboard, ipcMain, nativeImage, nativeTheme, net, powerMonitor, screen, shell } = require('electron');
const path = require('node:path');
const settings = require('./settings.cjs');
const notifications = require('./notifications.cjs');
const { createTray } = require('./tray.cjs');
const pkg = require('./package.json');

const APP_ID = 'com.unybrands.slackanalyze';
const DEV_URL = 'http://localhost:3000';
const ASSETS = path.join(__dirname, 'assets');
const CONNECT_PAGE = path.join(__dirname, 'pages', 'connect.html');
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
/** Started by "Open at login": stay in the tray until the user opens the window. */
const startHidden = process.argv.includes('--hidden');

/** @type {BrowserWindow | null} */
let win = null;
let trayCtl = null;
let appIcon = null;
let quitting = false;
let shownOnce = false;
/** Origin of the dashboard currently loaded; only it may use the desktop bridge. */
let appOrigin = null;
/** Origin of the backend API (files, avatars); reported by the dashboard. */
let apiOrigin = null;
/** Why the dashboard could not be loaded (shown on the connect page). */
let loadError = null;
let dndTimer = null;
let boundsTimer = null;

// ---------------------------------------------------------------------------
// URLs and trust
// ---------------------------------------------------------------------------

/** "dashboard.example.com" / "https://dashboard.example.com/c/x" → "https://dashboard.example.com" (null if invalid). */
function normalizeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `${/^(localhost|127\.0\.0\.1)(:|$)/i.test(s) ? 'http' : 'https'}://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Dashboard URL: SA_APP_URL env (dev) → the one chosen on the connect page → the build default → localhost in dev. */
function configuredUrl() {
  return (
    normalizeUrl(process.env.SA_APP_URL) ??
    normalizeUrl(settings.get('appUrl')) ??
    normalizeUrl(pkg.desktop?.appUrl) ??
    (app.isPackaged ? null : DEV_URL)
  );
}

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};
const isAppUrl = (url) => Boolean(appOrigin) && originOf(url) === appOrigin;
const isTrustedUrl = (url) => isAppUrl(url) || (Boolean(apiOrigin) && originOf(url) === apiOrigin);

/** IPC from the dashboard page in the main window (never from other sites or child windows). */
const fromApp = (e) => Boolean(win) && e.sender === win.webContents && isAppUrl(e.senderFrame?.url ?? '');
/** IPC from the bundled connect page. */
const fromConnectPage = (e) => Boolean(win) && e.sender === win.webContents && (e.senderFrame?.url ?? '').startsWith('file:');

function openExternal(url) {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url).catch(() => {});
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function restoredBounds() {
  const b = settings.get('bounds');
  const size = { width: 1360, height: 880 };
  if (!b || !b.width || !b.height) return size;
  // Only reuse the position if the window would still be on a connected screen.
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 120 && b.x + b.width > a.x + 120 && b.y >= a.y - 20 && b.y < a.y + a.height - 120);
  return onScreen ? { x: b.x, y: b.y, width: b.width, height: b.height } : { width: b.width, height: b.height };
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  settings.set({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (!shownOnce && settings.get('maximized')) win.maximize();
  shownOnce = true;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    ...restoredBounds(),
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: 'Slack Analyze',
    icon: path.join(ASSETS, isWin ? 'icon.ico' : 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1d21' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Keep live updates, notifications and the badge running while the window is hidden in the tray.
      backgroundThrottling: false,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    if (!startHidden) showWindow();
  });
  win.on('focus', () => win?.flashFrame(false));
  win.on('show', () => trayCtl?.reapply());
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) {
    win.on(ev, () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(saveBounds, 400);
    });
  }
  win.on('close', (e) => {
    saveBounds();
    if (quitting) return;
    if (isMac || settings.get('closeToTray')) {
      e.preventDefault();
      win.hide();
      if (isWin && !settings.get('trayHintShown')) {
        settings.set({ trayHintShown: true });
        trayCtl?.displayBalloon(
          'Slack Analyze is still running',
          'You will keep getting notifications. Right-click the tray icon to quit or change this.',
        );
      }
    }
  });
  win.on('closed', () => {
    win = null;
  });

  guardContents(win.webContents);
  const wc = win.webContents;
  wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    // -3 = aborted (a newer navigation replaced this one)
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return;
    showConnect({ code, description, url });
  });
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    console.error('[desktop] renderer gone:', details.reason);
    setTimeout(() => win && !win.isDestroyed() && loadApp(), 1000);
  });
  setupSession(wc.session);
  loadApp();
}

/** Link, popup and navigation rules shared by the main window and its child windows. */
function guardContents(wc) {
  wc.setWindowOpenHandler(({ url }) => {
    // Archived files (PDFs, images) open in an app window that shares the sign-in; everything else in the browser.
    if (isTrustedUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 800,
          autoHideMenuBar: true,
          icon: path.join(ASSETS, isWin ? 'icon.ico' : 'icon.png'),
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => guardContents(child.webContents));
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') && wc.getURL().startsWith('file:')) return;
    // The API origin is allowed so "Download" links (Content-Disposition: attachment) become downloads.
    if (isTrustedUrl(url)) return;
    e.preventDefault();
    openExternal(url);
  });
  wc.on('context-menu', (_e, params) => showContextMenu(wc, params));
}

function setupSession(ses) {
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const allowed = ['clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'notifications'];
    callback(isTrustedUrl(details.requestingUrl ?? '') && allowed.includes(permission));
  });
  ses.on('will-download', (_e, item) => {
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return;
      const file = item.getSavePath();
      notifications.info({ title: 'Download complete', body: path.basename(file), icon: appIcon, onClick: () => shell.showItemInFolder(file) });
    });
  });
}

function loadApp(url = configuredUrl()) {
  if (!win || win.isDestroyed()) return;
  appOrigin = url;
  if (!url) {
    showConnect(null);
    return;
  }
  loadError = null;
  win.loadURL(url).catch(() => {}); // failures arrive as did-fail-load
}

function showConnect(error) {
  loadError = error;
  win?.loadFile(CONNECT_PAGE).catch(() => {});
  // A first-run setup or an unreachable server needs the window, even when started hidden.
  if (!error || !startHidden || shownOnce) showWindow();
}

function changeServer() {
  showConnect(null);
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

function showContextMenu(wc, params) {
  const sep = { type: 'separator' };
  const items = [];
  if (params.misspelledWord) {
    for (const s of params.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
    items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, sep);
  }
  if (params.linkURL && /^(https?:|mailto:)/i.test(params.linkURL)) {
    items.push(
      { label: 'Open link in browser', click: () => openExternal(params.linkURL) },
      { label: 'Copy link', click: () => clipboard.writeText(params.linkURL) },
      sep,
    );
  }
  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) }, { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) }, sep);
  }
  if (params.isEditable) {
    const f = params.editFlags;
    items.push(
      { role: 'undo', enabled: f.canUndo },
      { role: 'redo', enabled: f.canRedo },
      sep,
      { role: 'cut', enabled: f.canCut },
      { role: 'copy', enabled: f.canCopy },
      { role: 'paste', enabled: f.canPaste },
      { role: 'selectAll', enabled: f.canSelectAll },
    );
  } else if (params.selectionText.trim()) {
    items.push({ role: 'copy' });
  }
  if (!app.isPackaged) items.push(sep, { label: 'Inspect element', click: () => wc.inspectElement(params.x, params.y) });
  while (items.length && items[items.length - 1].type === 'separator') items.pop();
  if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(wc) ?? undefined });
}

function buildAppMenu() {
  const history = () => win?.webContents.navigationHistory;
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Change server…', click: changeServer },
        { type: 'separator' },
        isMac ? { role: 'close' } : { label: 'Close window', accelerator: 'Ctrl+W', click: () => win?.close() },
        { label: 'Quit Slack Analyze', accelerator: 'CmdOrCtrl+Q', click: quit },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: () => history()?.canGoBack() && history().goBack() },
        { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: () => history()?.canGoForward() && history().goForward() },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open dashboard in browser',
          click: () => {
            const current = win?.webContents.getURL() ?? '';
            openExternal(isAppUrl(current) ? current : (appOrigin ?? ''));
          },
        },
        { type: 'separator' },
        { label: `Slack Analyze ${app.getVersion()}`, enabled: false },
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Do not disturb (pause notifications from the tray)
// ---------------------------------------------------------------------------

function currentDnd() {
  const until = Number(settings.get('dndUntil')) || 0;
  return until > Date.now() ? until : 0;
}

function setDnd(until) {
  settings.set({ dndUntil: until > Date.now() ? until : 0 });
  scheduleDndEnd();
  trayCtl?.reapply(); // badge + tray dot turn gray while paused, red again on resume
  win?.webContents.send('desktop:dnd', currentDnd());
}

function scheduleDndEnd() {
  clearTimeout(dndTimer);
  const until = currentDnd();
  if (until) dndTimer = setTimeout(() => setDnd(0), Math.min(until - Date.now() + 500, 2 ** 31 - 1));
}

// ---------------------------------------------------------------------------
// Bridge with the dashboard (see preload.cjs and src/lib/desktop.ts)
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.on('desktop:notify', (e, p) => {
    if (!fromApp(e) || !p || typeof p !== 'object' || currentDnd()) return;
    const id = String(p.id ?? '');
    const href = typeof p.href === 'string' && p.href.startsWith('/') ? p.href : null;
    void notifications.show(
      {
        id,
        title: String(p.title ?? ''),
        subtitle: typeof p.subtitle === 'string' ? p.subtitle : undefined,
        body: String(p.body ?? ''),
        iconUrl: typeof p.iconUrl === 'string' ? p.iconUrl : null,
        tag: String(p.tag ?? id),
      },
      {
        session: win.webContents.session,
        fallbackIcon: appIcon,
        onClick: () => {
          showWindow();
          win?.webContents.send('desktop:notification-click', { id, href });
        },
      },
    );
    if (settings.get('flashFrame') && !win.isFocused()) {
      if (isMac) app.dock?.bounce('informational');
      else win.flashFrame(true);
    }
  });

  ipcMain.on('desktop:unread', (e, count) => {
    if (fromApp(e)) trayCtl?.setUnread(Number(count));
  });

  ipcMain.on('desktop:api-origin', (e, url) => {
    if (fromApp(e)) apiOrigin = normalizeUrl(url);
  });

  ipcMain.handle('desktop:state', (e) => (fromApp(e) ? { dndUntil: currentDnd(), version: app.getVersion() } : null));

  ipcMain.handle('desktop:connect-info', (e) => {
    if (!fromConnectPage(e)) return null;
    return { url: appOrigin ?? configuredUrl() ?? '', error: loadError, canCancel: Boolean(configuredUrl()) && !loadError, version: app.getVersion() };
  });

  ipcMain.handle('desktop:connect', async (e, raw) => {
    if (!fromConnectPage(e)) return { ok: false, error: 'Not allowed.' };
    const url = normalizeUrl(raw);
    if (!url) return { ok: false, error: 'Enter the dashboard address, e.g. https://slack-analyze.example.com' };
    try {
      const res = await net.fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.status >= 500) throw new Error(`the server answered ${res.status}`);
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'no answer within 10 seconds' : (err?.message ?? 'network error');
      return { ok: false, error: `Couldn't reach ${url} — ${reason}.` };
    }
    settings.set({ appUrl: url });
    settings.flush();
    loadApp(url);
    return { ok: true };
  });

  ipcMain.on('desktop:connect-cancel', (e) => {
    if (fromConnectPage(e)) loadApp();
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function quit() {
  quitting = true;
  app.quit();
}

function start() {
  appIcon = nativeImage.createFromPath(path.join(ASSETS, 'icon.png'));
  if (isMac) app.dock?.setIcon(appIcon);
  Menu.setApplicationMenu(buildAppMenu());
  registerIpc();
  trayCtl = createTray({
    getWindow: () => win,
    showWindow,
    markAllRead: () => win?.webContents.send('desktop:mark-all-read'),
    changeServer: () => {
      showWindow();
      changeServer();
    },
    setDnd,
    getDnd: currentDnd,
    settings,
    quit,
  });
  createWindow();
  scheduleDndEnd();

  // Back from sleep / network change: retry a dashboard that could not be reached.
  powerMonitor.on('resume', () => {
    if (loadError && win) loadApp();
  });
}

// Windows groups notifications and the taskbar button by this id (the installer's shortcut carries the same one).
if (isWin) app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow); // macOS dock click
  app.on('before-quit', () => {
    quitting = true;
    saveBounds();
    settings.flush();
  });
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
  app.whenReady().then(start);
}
