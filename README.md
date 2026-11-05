# Slack Analyze — Frontend

The web dashboard for Slack Analyze.

Capture Slack channel and DM history from the Slack web app, store it in PostgreSQL, and browse, search and analyze it in a Slack-style web UI.

```
┌──────────────────────┐   batches (HTTP, real time)   ┌──────────────┐     ┌──────────────┐
│ Chrome extension     │ ─────────────────────────────▶│ Backend API  │────▶│ PostgreSQL   │
│ (app.slack.com tab)  │   X-API-Key                   │ Fastify :4000│◀────│ :5432        │
│ auto-scroll + live   │                               └──────┬───────┘     └──────────────┘
└──────────────────────┘                                      │ REST + SSE (/api/stream)
                                                              ▼
                                                      ┌──────────────┐
                                                      │ Next.js UI   │
                                                      │ :3000        │
                                                      └──────────────┘
```

| Repo | What it is |
|---|---|
| [slack-analyze-extension](https://github.com/core7matrix/slack-analyze-extension) | Chrome MV3 extension: scrapes the open Slack tab, auto-scrolls up through history, sends batches to the backend, timed auto-sync, live capture, offline retry queue |
| [slack-analyze-backend](https://github.com/core7matrix/slack-analyze-backend) | Node 22 + TypeScript + Fastify. Ingest API (extension → DB), read/search/analytics API, Server-Sent Events for live updates. Applies DB migrations on startup |
| [slack-analyze-frontend](https://github.com/core7matrix/slack-analyze-frontend) | Next.js 15 (App Router) + Tailwind: Slack-like message browser, search, analytics, sync status, admin dashboard |

Clone them side by side (`slack-analyze-backend`, `slack-analyze-frontend`, `slack-analyze-extension` in one folder); the frontend's icon export writes into the extension checkout next to it.


## Quick start

Start [slack-analyze-backend](https://github.com/core7matrix/slack-analyze-backend) first, then:

```bash
npm install
npm run dev        # http://localhost:3000, talks to NEXT_PUBLIC_API_URL (default http://localhost:4000)
```

Or in VS Code / Cursor: **Tasks: Run Task → dev: frontend**. Copy [.env.example](.env.example) to `.env.local` to point at another backend.

## Deploy (Vercel)

Import this repo in Vercel (root directory = repo root, framework Next.js) and set `NEXT_PUBLIC_API_URL` to the backend project, e.g. `https://slack-analyze-api.vercel.app`. The backend is its own Vercel project. On Vercel it already uses a cross-site session cookie (`SameSite=None`, `Secure`) and trusts the proxy.

## App mark

[brand/](brand/) holds the SVG masters (`logo.svg`, `logo-small.svg` for 16 px). `node brand/export.mjs` regenerates `favicon.ico`, `icon.svg`, the Apple touch icon, the extension's toolbar icons and the desktop app's icon, tray icons and taskbar badges (`electron/assets/`) via headless Chrome. The extension icons are written to `../slack-analyze-extension/icons` (override with `EXTENSION_DIR`); commit them in that repo.

## Notifications in the dashboard

Messages caught by live capture pop up in the web UI as **toasts** and **desktop notifications**, from every channel, DM and thread:

- The **bell** in the left rail shows the unread count (also in the tab title) and the last 100 notifications; click one to jump to the message (thread replies open the thread panel). **Settings** in the bell panel turns toasts, desktop notifications, sound and bot messages on or off, per browser.
- Desktop notifications need the browser's permission (the dashboard asks once; or use **Allow desktop notifications** in the bell's settings) and an `https://` or `localhost` address. By default they show while the dashboard tab is in the background; toasts show while it is visible.
- Only new messages notify: history syncs, messages older than 30 minutes, joins / topic changes and the conversation you're already looking at don't pop up. Viewers only get notifications for communities they can see; admin-hidden conversations notify admins only.

## Desktop app (Electron)

[electron/](electron/) wraps the dashboard in a native Windows / macOS / Linux app. It loads the dashboard from its server (it doesn't bundle a copy), so it's always the deployed version, and adds:

- **Native notifications** — new Slack messages appear as Windows toasts / macOS Notification Center alerts with the sender's avatar, one per conversation (a newer message replaces the older one). Clicking one brings the window forward and opens the message (thread replies open the thread). They follow the bell's settings (desktop on/off, *also while focused*, bots); the dashboard plays its own chime, so the OS sound stays off.
- **Unread badge** — the bell's unread count appears on the **taskbar button** (Windows overlay), the **dock** (macOS) or the launcher (Linux), and in the window title: the exact count up to 99, then **99+**. On Windows it's a red disc with a light ring, pre-rendered for 100 / 125 / 150 / 200 % display scaling so it stays sharp; it turns **gray while notifications are paused**, and screen readers announce the count with the taskbar button. The taskbar button flashes on a new message while the window isn't focused (can be turned off).
- **Tray icon** — gets a red dot when there are unread messages (gray while paused); its tooltip and menu show the exact count. Left-click opens the window; right-click: open, *Mark all as read*, **Pause notifications** (30 min / 1 h / 2 h / until 8:00 tomorrow; the bell shows the pause and the chime stays quiet), *Open at login* (starts hidden in the tray), *Keep running in the tray when closed*, *Flash the taskbar*, *Change server…*, *Quit*.
- **Window** — closing hides to the tray (a one-time hint says so), size / position / maximized are remembered, one instance only (opening it again focuses the window). Live updates keep running while hidden.
- **Safe browsing** — only the dashboard's own origin can use the desktop bridge; links to other sites open in the default browser; archived files open in an app window that shares the sign-in, and downloads show a *Download complete* notification. If the dashboard can't be reached, a branded connect page explains why and retries every 15 s (and when the network comes back).

```bash
npm run desktop:dev   # Next.js on :3000 + the desktop app pointed at it (start the backend first)
npm run desktop       # desktop app only, against SA_APP_URL (default http://localhost:3000 in development)
npm run desktop:dist  # installer in dist-desktop/ (Windows: NSIS Slack-Analyze-Setup-<version>.exe)
```

**Which dashboard it opens**: `SA_APP_URL` env → the address entered on the connect page (stored in `%APPDATA%\Slack Analyze\settings.json`) → `desktop.appUrl` in [electron/package.json](electron/package.json) → `http://localhost:3000` when not packaged. A packaged build with no address asks for it on first start. To ship an installer that opens your deployment straight away:

```bash
npx electron-builder -c.extraMetadata.desktop.appUrl=https://your-dashboard.vercel.app
```

The dashboard's session cookie is cross-site (`SameSite=None; Secure`) on Vercel, so sign-in works the same as in the browser. The tray, badge and installer images live in [electron/assets/](electron/assets/); `ONLY=desktop node brand/export.mjs` regenerates them from the brand SVGs. Taskbar badges are one sprite sheet per display scale (`badges/badge-sprite-16|20|24|32.png`: cells "1" … "99", "99+"; row 1 is the paused gray), cropped by [electron/tray.cjs](electron/tray.cjs); the export also writes an enlarged `brand/badge-preview.png` (not committed) for reviewing the design. On Vercel, set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` so the web build doesn't download Electron.

Notes: Windows only shows the taskbar overlay with normal-sized taskbar buttons (not "small taskbar buttons"). In development, Windows toasts are attributed to Electron; the installed app shows them as *Slack Analyze*. Installers aren't code-signed yet, so Windows SmartScreen warns on first install.

## Admin dashboard

The first time you open the web UI it asks you to **create the first admin**. After that everyone signs in; admins create other users.

| Role | Can |
|---|---|
| **viewer** | Browse, search and analyze. Never sees conversations an admin has hidden. |
| **admin** | Everything, plus **Admin** in the left rail: |

- **Overview** — messages, 24 h ingest, browsers online, sync runs (ok / failed), conversations, database size, hourly ingest chart, recent failures.
- **Content** — per workspace: retention (delete and stop storing messages older than *N* days), CSV/JSON export, delete workspace. Conversation table with filters (hidden, excluded, partial history, not captured) and bulk or per-row actions: **Hide** from viewers, **Exclude** from capture (ingest ignores it, extensions skip it), **Sync** with a chosen browser, **Purge** messages (optionally before a date), export, delete. Single messages can be deleted from the conversation view (hover → trash); deleted messages are never re-captured.
- **Browsers** — every extension install with its Slack account, online status, runs, failures. **Pause** / **resume** / **revoke** capture, and send commands: sync the open conversation, refresh the conversation list, stop, or push capture settings. Commands reach the browser with its next heartbeat (every 30 s) and report back a result.
- **Users** — add users (with a generated temporary password), change role, reset password, deactivate, delete. The last active admin can't be removed.
- **Audit log** — every admin action, sign-in and export.

Set `COOKIE_SECURE=true` when the dashboard is served over HTTPS.
