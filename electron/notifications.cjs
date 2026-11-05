'use strict';
// Native OS notifications (Windows toast / macOS Notification Center / libnotify) for new Slack messages.
const { Notification, nativeImage } = require('electron');

const MAX_ICONS = 300;
const ICON_TIMEOUT_MS = 2500;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** Sender avatars as native images, by URL (null = could not be loaded; don't retry for this run). */
const icons = new Map();
/** Notification shown per conversation, so a newer one replaces it instead of stacking up. */
const active = new Map();

const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function loadIcon(session, url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (icons.has(url)) return icons.get(url);
  let img = null;
  try {
    // The app's session: the dashboard's sign-in cookie reaches archived avatars served by the API.
    const res = await session.fetch(url, { signal: AbortSignal.timeout(ICON_TIMEOUT_MS) });
    const size = Number(res.headers.get('content-length') ?? 0);
    if (res.ok && size <= MAX_ICON_BYTES) {
      const buf = Buffer.from(await res.arrayBuffer());
      // PNG and JPEG decode everywhere; other formats come back empty and fall back to the app icon.
      const decoded = buf.length <= MAX_ICON_BYTES ? nativeImage.createFromBuffer(buf) : null;
      if (decoded && !decoded.isEmpty()) img = decoded.resize({ width: 96, height: 96, quality: 'best' });
    }
  } catch {
    // offline, timed out or blocked: use the app icon
  }
  if (icons.size >= MAX_ICONS) icons.delete(icons.keys().next().value);
  icons.set(url, img);
  return img;
}

/**
 * Shows one notification.
 * @param {{ id: string, title: string, body: string, subtitle?: string, iconUrl?: string|null, tag: string }} payload
 * @param {{ session: Electron.Session, fallbackIcon: Electron.NativeImage, onClick: () => void }} opts
 */
async function show(payload, { session, fallbackIcon, onClick }) {
  if (!Notification.isSupported()) return false;
  const icon = (await loadIcon(session, payload.iconUrl)) ?? fallbackIcon;
  const n = new Notification({
    title: clip(payload.title, 120) || 'New message',
    subtitle: clip(payload.subtitle, 120) || undefined, // macOS only
    body: clip(payload.body, 400),
    icon,
    silent: true, // the dashboard plays its own chime (and respects its Sound setting)
    timeoutType: 'default',
    urgency: 'normal',
  });
  const tag = clip(payload.tag, 200) || payload.id;
  const previous = active.get(tag);
  active.set(tag, n);
  n.on('click', () => {
    onClick();
    n.close();
  });
  n.on('close', () => {
    if (active.get(tag) === n) active.delete(tag);
  });
  n.show();
  previous?.close();
  return true;
}

/** Info notifications stay referenced until closed, or their click handler can be garbage-collected. */
const infos = new Set();

/** Simple informational notification (downloads, tray hint). */
function info({ title, body, icon, onClick }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon, silent: true });
  infos.add(n);
  n.on('click', () => onClick?.());
  n.on('close', () => infos.delete(n));
  n.show();
}

function closeAll() {
  for (const n of active.values()) n.close();
  active.clear();
}

module.exports = { show, info, closeAll };
