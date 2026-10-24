'use client';

import clsx from 'clsx';
import { Bell, BellOff, CheckCheck, MessageSquareReply, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Slide, ToastContainer, toast } from 'react-toastify';
import { fmtRelative } from '@/lib/format';
import { useLiveEvents, type LiveNotification } from '@/lib/live';
import {
  addNotifications,
  clearNotifications,
  conversationLabel,
  desktopSupported,
  getNotifyPrefs,
  markRead,
  notificationBody,
  notificationHref,
  notificationTitle,
  playChime,
  setNotifyPrefs,
  useNotifications,
  useNotifyPrefs,
  type NotificationItem,
  type NotifyPrefs,
} from '@/lib/notifications';
import { Avatar, WorkspaceLogo } from './Avatar';

/** More messages than this in one burst become a single summary toast. */
const TOAST_BURST = 3;

function usePermission() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => setPermission(desktopSupported() ? Notification.permission : 'unsupported'), []);
  const request = async () => {
    if (!desktopSupported()) return;
    setPermission(await Notification.requestPermission());
  };
  return { permission, request };
}

function ToastBody({ n, extra }: { n: NotificationItem; extra?: number }) {
  return (
    <div className="flex min-w-0 gap-3">
      <Avatar name={n.userName ?? '?'} url={n.avatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
          <span className="truncate">{notificationTitle(n)}</span>
          {n.threadTs && <MessageSquareReply size={13} className="flex-none text-muted" />}
        </div>
        <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-[13px] leading-snug text-ink/80">{notificationBody(n)}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <WorkspaceLogo workspace={{ id: n.workspaceId, name: n.workspaceName, iconUrl: n.workspaceIconUrl }} size={14} />
          <span className="truncate">{n.workspaceName ?? n.workspaceId}</span>
          {extra ? <span className="flex-none font-semibold text-accent">+{extra} more</span> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Turns live "notification" events into toasts, desktop notifications and a chime. Mounted once in the app shell.
 * Messages in the conversation already on screen don't pop up (they appear in the view), but still land in the bell.
 */
export function NotificationListener() {
  const router = useRouter();
  const pathname = usePathname();
  const here = useRef(pathname);
  here.current = pathname;
  const items = useNotifications();
  const unread = items.filter((i) => !i.read).length;

  // Unread count in the tab title, like Slack.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
  }, [unread, pathname]);

  const open = (n: NotificationItem) => {
    markRead(n.id);
    router.push(notificationHref(n));
  };

  useLiveEvents((e) => {
    if (e.type !== 'notification') return;
    const prefs = getNotifyPrefs();
    const data: LiveNotification = prefs.bots ? e.data : { ...e.data, messages: e.data.messages.filter((m) => !m.isBot) };
    if (!data.messages.length) return;

    const visible = document.visibilityState === 'visible';
    const focused = visible && document.hasFocus();
    const onScreen = visible && here.current === `/c/${data.workspaceId}/${data.channelId}`;
    // Thread replies aren't visible in the channel view, so they still notify there.
    const fresh = addNotifications(data, onScreen && data.messages.every((m) => !m.threadTs));
    const toNotify = onScreen ? fresh.filter((n) => n.threadTs) : fresh;
    if (!toNotify.length) return;

    if (prefs.sound) playChime();

    if (prefs.toast && visible) {
      const shown = toNotify.length > TOAST_BURST ? [toNotify[toNotify.length - 1]] : toNotify;
      for (const n of shown) {
        toast(<ToastBody n={n} extra={toNotify.length > TOAST_BURST ? toNotify.length - 1 : undefined} />, {
          toastId: n.id,
          onClick: () => open(n),
        });
      }
    }

    if (prefs.desktop && desktopSupported() && Notification.permission === 'granted' && (!focused || prefs.desktopWhenFocused)) {
      // One desktop notification per conversation per burst; the tag replaces an older one for the same conversation.
      const n = toNotify[toNotify.length - 1];
      const more = toNotify.length - 1;
      const desktop = new Notification(notificationTitle(n), {
        body: `${notificationBody(n)}${more ? `\n+${more} more in ${conversationLabel(n)}` : ''}`,
        icon: n.avatarUrl ?? n.workspaceIconUrl ?? '/icon.svg',
        tag: `${n.workspaceId}:${n.channelId}`,
      });
      desktop.onclick = () => {
        window.focus();
        open(n);
        desktop.close();
      };
    }
  });

  // Ask once per browser session for desktop permission, with a toast the user clicks (browsers want a gesture).
  useEffect(() => {
    if (!desktopSupported() || Notification.permission !== 'default' || !getNotifyPrefs().desktop) return;
    try {
      if (sessionStorage.getItem('sa.notify.asked')) return;
      sessionStorage.setItem('sa.notify.asked', '1');
    } catch {
      // ignore
    }
    toast(
      ({ closeToast }) => (
        <div className="text-[13px] text-ink">
          <div className="font-bold">Get desktop notifications for new Slack messages?</div>
          <p className="mt-0.5 text-muted">New messages from every channel, DM and thread, even when this tab is in the background.</p>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md bg-accent px-3 py-1 text-xs font-bold text-white hover:opacity-90"
              onClick={() => {
                Notification.requestPermission().finally(closeToast);
              }}
            >
              Enable
            </button>
            <button className="rounded-md px-3 py-1 text-xs font-semibold text-muted hover:bg-hover" onClick={closeToast}>
              Not now
            </button>
          </div>
        </div>
      ),
      { toastId: 'notify-permission', autoClose: false, closeOnClick: false },
    );
  }, []);

  return (
    <ToastContainer
      position="bottom-right"
      autoClose={6000}
      newestOnTop
      limit={5}
      closeOnClick
      pauseOnFocusLoss
      transition={Slide}
      hideProgressBar
      theme="light"
      toastClassName="!cursor-pointer !rounded-xl !border !border-line !bg-bg !p-3 !shadow-pop"
    />
  );
}

function Toggle({ label, k, prefs, disabled }: { label: string; k: keyof NotifyPrefs; prefs: NotifyPrefs; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-center justify-between gap-3 py-1 text-[13px]', disabled && 'opacity-50')}>
      <span>{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--accent)]"
        checked={prefs[k]}
        disabled={disabled}
        onChange={(e) => setNotifyPrefs({ [k]: e.target.checked })}
      />
    </label>
  );
}

/** Bell in the rail: unread badge, recent notifications and notification settings. */
export function NotificationBell() {
  const router = useRouter();
  const items = useNotifications();
  const prefs = useNotifyPrefs();
  const { permission, request } = usePermission();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => !i.read).length;
  const muted = !prefs.toast && !prefs.desktop;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const Icon = muted ? BellOff : Bell;
  return (
    <div ref={box} className="relative mb-3">
      <button
        onClick={() => setOpen(!open)}
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        className={clsx('relative grid h-9 w-9 place-items-center rounded-lg transition duration-150 hover:bg-white/15', open && 'bg-white/25')}
      >
        <Icon size={19} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#e01e5a] px-1 text-[10px] font-black leading-none ring-2 ring-rail">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-0 left-12 z-50 flex max-h-[min(640px,85dvh)] w-[min(380px,calc(100vw-88px))] origin-bottom-left animate-pop-in flex-col rounded-xl border border-line bg-bg text-ink shadow-pop">
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
            <div className="flex-1 font-black">Notifications</div>
            <button
              onClick={() => markRead()}
              disabled={!unread}
              title="Mark all as read"
              className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              <CheckCheck size={16} />
            </button>
            <button
              onClick={clearNotifications}
              disabled={!items.length}
              title="Clear all"
              className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              <Trash2 size={15} />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={clsx('rounded-md px-2 py-1 text-xs font-bold transition hover:bg-hover', showSettings ? 'text-accent' : 'text-muted')}
            >
              Settings
            </button>
          </div>

          {showSettings && (
            <div className="border-b border-line bg-subtle px-3.5 py-2.5">
              <Toggle label="Pop-up toasts in this tab" k="toast" prefs={prefs} />
              <Toggle label="Desktop notifications" k="desktop" prefs={prefs} disabled={permission === 'unsupported'} />
              <Toggle label="…also while this tab is focused" k="desktopWhenFocused" prefs={prefs} disabled={!prefs.desktop || permission !== 'granted'} />
              <Toggle label="Sound" k="sound" prefs={prefs} />
              <Toggle label="Include bots and apps" k="bots" prefs={prefs} />
              <div className="mt-1.5 text-xs text-muted">
                {permission === 'granted' && 'Desktop notifications are allowed in this browser.'}
                {permission === 'denied' && 'Desktop notifications are blocked — allow them in the browser’s site settings.'}
                {permission === 'unsupported' && 'Desktop notifications need https or localhost in a browser that supports them.'}
                {permission === 'default' && (
                  <button onClick={request} className="rounded-md bg-accent px-2.5 py-1 font-bold text-white hover:opacity-90">
                    Allow desktop notifications
                  </button>
                )}
              </div>
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {items.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted">
                No new messages yet.
                <br />
                New messages from every channel, DM and thread appear here while a browser with the extension has Slack open.
              </li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                    router.push(notificationHref(n));
                  }}
                  className={clsx('flex w-full gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-hover', !n.read && 'bg-accent-soft/60')}
                >
                  <Avatar name={n.userName ?? '?'} url={n.avatarUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-bold">{notificationTitle(n)}</span>
                      <span className="ml-auto flex-none text-[11px] text-muted">{fmtRelative(new Date(Number(n.ts) * 1000).toISOString())}</span>
                    </div>
                    <p className="line-clamp-2 break-words text-[13px] text-ink/80">{notificationBody(n)}</p>
                    <div className="mt-0.5 truncate text-[11px] text-muted">
                      {n.workspaceName ?? n.workspaceId}
                      {n.threadTs ? ' · thread reply' : ''}
                    </div>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" aria-label="unread" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
