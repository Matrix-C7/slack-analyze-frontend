'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, type ConversationType } from './api';

export interface LiveMessagesEvent {
  workspaceId: string;
  channelId: string;
  channelName: string;
  inserted: number;
  updated: number;
  newestTs: string | null;
}

/** New messages caught live by an extension (any channel, DM or thread), for toasts and desktop notifications. */
export interface LiveNotification {
  workspaceId: string;
  workspaceName: string | null;
  workspaceIconUrl: string | null;
  channelId: string;
  channelName: string;
  channelType: ConversationType;
  messages: {
    ts: string;
    threadTs: string | null;
    userId: string | null;
    userName: string | null;
    avatarUrl: string | null;
    isBot: boolean;
    text: string;
    fileCount: number;
  }[];
}

type Listener = (
  e:
    | { type: 'messages'; data: LiveMessagesEvent }
    | { type: 'sync_run'; data: { id: string; status: string } }
    | { type: 'notification'; data: LiveNotification },
) => void;

// One shared EventSource for the whole app.
let source: EventSource | null = null;
const listeners = new Set<Listener>();
const statusListeners = new Set<(ok: boolean) => void>();

function ensureSource() {
  if (source || typeof window === 'undefined') return;
  source = new EventSource(`${API_URL}/api/stream`, { withCredentials: true });
  source.onopen = () => statusListeners.forEach((l) => l(true));
  source.onerror = () => statusListeners.forEach((l) => l(false));
  source.addEventListener('messages', (e) => {
    const data = JSON.parse((e as MessageEvent).data);
    listeners.forEach((l) => l({ type: 'messages', data }));
  });
  source.addEventListener('notification', (e) => {
    const data = JSON.parse((e as MessageEvent).data);
    listeners.forEach((l) => l({ type: 'notification', data }));
  });
  source.addEventListener('sync_run', (e) => {
    const data = JSON.parse((e as MessageEvent).data);
    listeners.forEach((l) => l({ type: 'sync_run', data }));
  });
}

/** Subscribe to backend ingest events (Server-Sent Events). */
export function useLiveEvents(listener: Listener) {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    ensureSource();
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

export function useLiveStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    ensureSource();
    if (source?.readyState === EventSource.OPEN) setOk(true);
    statusListeners.add(setOk);
    return () => {
      statusListeners.delete(setOk);
    };
  }, []);
  return ok;
}
