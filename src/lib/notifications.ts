'use client';

import { useSyncExternalStore } from 'react';
import type { ConversationType } from './api';
import type { LiveNotification } from './live';

/** One new Slack message as shown in the bell panel, toasts and desktop notifications. */
export interface NotificationItem {
  id: string; // workspace:channel:ts
  workspaceId: string;
  workspaceName: string | null;
  workspaceIconUrl: string | null;
  channelId: string;
  channelName: string;
  channelType: ConversationType;
  ts: string;
  threadTs: string | null;
  userName: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  text: string;
  fileCount: number;
  receivedAt: number;
  read: boolean;
}

export interface NotifyPrefs {
  toast: boolean;
  desktop: boolean;
  /** Desktop notifications also while this tab is focused (otherwise only toasts then). */
  desktopWhenFocused: boolean;
  sound: boolean;
  bots: boolean;
}

const DEFAULT_PREFS: NotifyPrefs = { toast: true, desktop: true, desktopWhenFocused: false, sound: true, bots: true };
const PREFS_KEY = 'sa.notify.prefs';
const ITEMS_KEY = 'sa.notify.items';
const MAX_ITEMS = 100;

// Browser storage is a per-viewer convenience here; it may be unavailable (private mode, blocked site data).
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Store (module-level, shared by every component)
// ---------------------------------------------------------------------------

let items: NotificationItem[] = [];
let prefs: NotifyPrefs = DEFAULT_PREFS;
let loaded = false;
const subscribers = new Set<() => void>();

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  items = load<NotificationItem[]>(ITEMS_KEY, []);
  prefs = { ...DEFAULT_PREFS, ...load<Partial<NotifyPrefs>>(PREFS_KEY, {}) };
}

function changed() {
  save(ITEMS_KEY, items);
  subscribers.forEach((s) => s());
}

function subscribe(cb: () => void) {
  ensureLoaded();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

const EMPTY: NotificationItem[] = [];

export function useNotifications() {
  return useSyncExternalStore(
    subscribe,
    () => (ensureLoaded(), items),
    () => EMPTY,
  );
}

export function useNotifyPrefs() {
  return useSyncExternalStore(
    subscribe,
    () => (ensureLoaded(), prefs),
    () => DEFAULT_PREFS,
  );
}

export function getNotifyPrefs(): NotifyPrefs {
  ensureLoaded();
  return prefs;
}

export function setNotifyPrefs(patch: Partial<NotifyPrefs>) {
  ensureLoaded();
  prefs = { ...prefs, ...patch };
  save(PREFS_KEY, prefs);
  subscribers.forEach((s) => s());
}

/** Adds the messages of a live event; returns only the ones not seen before (the same message can arrive twice). */
export function addNotifications(e: LiveNotification, read: boolean): NotificationItem[] {
  ensureLoaded();
  const known = new Set(items.map((i) => i.id));
  const fresh: NotificationItem[] = [];
  for (const m of e.messages) {
    const id = `${e.workspaceId}:${e.channelId}:${m.ts}`;
    if (known.has(id)) continue;
    known.add(id);
    fresh.push({
      id,
      workspaceId: e.workspaceId,
      workspaceName: e.workspaceName,
      workspaceIconUrl: e.workspaceIconUrl,
      channelId: e.channelId,
      channelName: e.channelName,
      channelType: e.channelType,
      ts: m.ts,
      threadTs: m.threadTs,
      userName: m.userName,
      avatarUrl: m.avatarUrl,
      isBot: m.isBot,
      text: m.text,
      fileCount: m.fileCount,
      receivedAt: Date.now(),
      read,
    });
  }
  if (fresh.length) {
    items = [...fresh.reverse(), ...items].slice(0, MAX_ITEMS);
    changed();
  }
  return fresh;
}

export function markRead(id?: string) {
  ensureLoaded();
  if (!items.some((i) => !i.read && (!id || i.id === id))) return;
  items = items.map((i) => (!id || i.id === id ? { ...i, read: true } : i));
  changed();
}

export function clearNotifications() {
  items = [];
  changed();
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Where a notification leads: the message in its conversation, with the thread open for replies. */
export function notificationHref(n: Pick<NotificationItem, 'workspaceId' | 'channelId' | 'ts' | 'threadTs'>) {
  const base = `/c/${n.workspaceId}/${n.channelId}`;
  return n.threadTs ? `${base}?ts=${n.threadTs}&thread=${n.threadTs}` : `${base}?ts=${n.ts}`;
}

export function conversationLabel(n: Pick<NotificationItem, 'channelName' | 'channelType'>) {
  return n.channelType === 'dm' || n.channelType === 'group_dm' ? n.channelName : `#${n.channelName}`;
}

/** "Jane in #general", "Jane (thread in #general)", or just "Jane" for a DM with Jane. */
export function notificationTitle(n: NotificationItem) {
  const who = n.userName ?? 'Someone';
  if (n.threadTs) return `${who} replied in ${conversationLabel(n)}`;
  if (n.channelType === 'dm') return who;
  return `${who} in ${conversationLabel(n)}`;
}

export function notificationBody(n: Pick<NotificationItem, 'text' | 'fileCount'>) {
  const text = n.text.trim();
  if (text) return text;
  return n.fileCount ? `Shared ${n.fileCount === 1 ? 'a file' : `${n.fileCount} files`}` : 'New message';
}

export const desktopSupported = () => typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;

/** A short, quiet two-note chime (no audio file needed). */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // audio blocked until the user interacts with the page; ignore
  }
}
