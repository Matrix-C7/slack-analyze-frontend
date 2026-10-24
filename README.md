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

Import this repo in Vercel (root directory = repo root, framework Next.js) and set `NEXT_PUBLIC_API_URL` to the backend's URL, e.g. `https://slack-analyze-api.onrender.com`. On the backend set `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true` and `TRUST_PROXY=true` (already in its `render.yaml`).

## App mark

[brand/](brand/) holds the SVG masters (`logo.svg`, `logo-small.svg` for 16 px). `node brand/export.mjs` regenerates `favicon.ico`, `icon.svg`, the Apple touch icon and the extension's toolbar icons via headless Chrome. The extension icons are written to `../slack-analyze-extension/icons` (override with `EXTENSION_DIR`); commit them in that repo.

## Notifications in the dashboard

Messages caught by live capture pop up in the web UI as **toasts** and **desktop notifications**, from every channel, DM and thread:

- The **bell** in the left rail shows the unread count (also in the tab title) and the last 100 notifications; click one to jump to the message (thread replies open the thread panel). **Settings** in the bell panel turns toasts, desktop notifications, sound and bot messages on or off, per browser.
- Desktop notifications need the browser's permission (the dashboard asks once; or use **Allow desktop notifications** in the bell's settings) and an `https://` or `localhost` address. By default they show while the dashboard tab is in the background; toasts show while it is visible.
- Only new messages notify: history syncs, messages older than 30 minutes, joins / topic changes and the conversation you're already looking at don't pop up. Viewers only get notifications for communities they can see; admin-hidden conversations notify admins only.

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
