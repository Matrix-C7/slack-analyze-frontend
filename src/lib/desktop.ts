'use client';

import { useSyncExternalStore } from 'react';

/** A native notification shown by the desktop app. */
export interface DesktopNotification {
  id: string;
  title: string;
  body: string;
  /** macOS only: second line under the title. */
  subtitle?: string;
  /** Sender avatar (http/https); falls back to the app icon. */
  iconUrl: string | null;
  /** A newer notification with the same tag replaces the older one (one per conversation). */
  tag: string;
  /** In-app path opened when the notification is clicked. */
  href: string;
}

/** `window.desktop`, exposed by the Electron preload (electron/preload.cjs). Absent in a normal browser. */
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  notify(n: DesktopNotification): void;
  setUnreadCount(count: number): void;
  setApiOrigin(url: string): void;
  getState(): Promise<{ dndUntil: number; version: string } | null>;
  onNotificationClick(cb: (e: { id: string; href: string | null }) => void): () => void;
  onMarkAllRead(cb: () => void): () => void;
  onDoNotDisturb(cb: (until: number) => void): () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** The desktop bridge when running inside the Slack Analyze desktop app, otherwise null. */
export function getDesktop(): DesktopBridge | null {
  return typeof window !== 'undefined' && window.desktop?.isDesktop ? window.desktop : null;
}

export const isDesktopApp = () => getDesktop() !== null;

// ---------------------------------------------------------------------------
// "Pause notifications" (set from the tray menu)
// ---------------------------------------------------------------------------

let dndUntil = 0;
let dndWired = false;
const dndSubscribers = new Set<() => void>();

function setDnd(until: number) {
  dndUntil = Number(until) || 0;
  dndSubscribers.forEach((s) => s());
}

function wireDnd() {
  const desktop = getDesktop();
  if (dndWired || !desktop) return;
  dndWired = true;
  desktop.onDoNotDisturb(setDnd);
  void desktop.getState().then((s) => s && setDnd(s.dndUntil));
}

/** True while notifications are paused from the desktop app's tray menu. */
export function desktopNotificationsPaused() {
  wireDnd();
  return dndUntil > Date.now();
}

/** Paused-until time (ms) or 0, for the notification settings panel. */
export function useDesktopPausedUntil() {
  return useSyncExternalStore(
    (cb) => {
      wireDnd();
      dndSubscribers.add(cb);
      return () => {
        dndSubscribers.delete(cb);
      };
    },
    () => (dndUntil > Date.now() ? dndUntil : 0),
    () => 0,
  );
}
