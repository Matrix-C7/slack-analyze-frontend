'use client';

import clsx from 'clsx';
import { BarChart3, Loader2, LogOut, MessageSquare, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SWRConfig } from 'swr';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useLiveStatus } from '@/lib/live';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace';
import { AccountTabs } from './AccountPicker';
import { Avatar, WorkspaceLogo } from './Avatar';
import { ChannelSidebar } from './ChannelSidebar';
import { NotificationBell, NotificationListener } from './NotificationCenter';

const SidebarCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export const useMobileSidebar = () => useContext(SidebarCtx);

const NAV = [
  { href: '/', label: 'Messages', icon: MessageSquare, match: (p: string) => p === '/' || p.startsWith('/c/') },
  { href: '/search', label: 'Search', icon: Search, match: (p: string) => p.startsWith('/search') },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, match: (p: string) => p.startsWith('/analytics') },
  { href: '/sync', label: 'Sync', icon: RefreshCw, match: (p: string) => p.startsWith('/sync') },
];
const ADMIN_NAV = { href: '/admin', label: 'Admin', icon: ShieldCheck, match: (p: string) => p.startsWith('/admin') };

function UserMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
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
  if (!me) return null;
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={me.email}
        aria-label="Account menu"
        aria-expanded={open}
        className="rounded-lg ring-white/50 transition hover:ring-2"
      >
        <Avatar name={me.name ?? me.email} size={32} />
      </button>
      {open && (
        <div className="absolute bottom-0 left-12 z-50 w-64 origin-bottom-left animate-pop-in rounded-xl border border-line bg-bg p-1.5 text-ink shadow-pop">
          <div className="flex items-center gap-3 p-2.5">
            <Avatar name={me.name ?? me.email} size={36} />
            <div className="min-w-0">
              <div className="truncate font-bold">{me.name ?? me.email}</div>
              <div className="truncate text-xs text-muted">{me.email}</div>
            </div>
          </div>
          <div className="px-2.5 pb-2">
            <span className="inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">{me.role}</span>
          </div>
          <div className="my-1 h-px bg-line" />
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors hover:bg-hover">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Rail() {
  const pathname = usePathname();
  const { workspaces, workspace, setWorkspaceId } = useWorkspace();
  const { isAdmin } = useAuth();
  const live = useLiveStatus();
  const nav = isAdmin ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <nav className="flex w-[68px] flex-none flex-col items-center gap-1 bg-gradient-to-b from-rail to-rail-2 py-3 text-white" aria-label="Main">
      {workspaces.map((w) => {
        const active = w.id === workspace?.id;
        return (
          <div key={w.id} className="relative mb-2 flex w-full justify-center">
            {/* Slack-style pill marking the selected workspace */}
            <span className={clsx('absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-200', active ? 'h-7' : 'h-0')} />
            <button
              onClick={() => setWorkspaceId(w.id)}
              title={w.name ?? w.id}
              aria-label={`Workspace ${w.name ?? w.id}`}
              aria-pressed={active}
              className={clsx(
                'rounded-[10px] transition duration-200',
                active ? 'ring-2 ring-white ring-offset-2 ring-offset-rail' : 'opacity-70 hover:scale-105 hover:opacity-100',
              )}
            >
              <WorkspaceLogo workspace={w} size={38} />
            </button>
          </div>
        );
      })}
      {workspaces.length > 0 && <div className="mb-2 h-px w-8 bg-white/15" />}
      {nav.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className="group flex w-full flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold"
            aria-current={active ? 'page' : undefined}
          >
            <span
              className={clsx(
                'grid h-9 w-9 place-items-center rounded-lg transition duration-150',
                active ? 'bg-white/25 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)]' : 'group-hover:bg-white/15',
              )}
            >
              <Icon size={19} className="transition-transform duration-150 group-hover:scale-110" />
            </span>
            <span className={clsx('transition-opacity', active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')}>{label}</span>
          </Link>
        );
      })}
      <div className="mt-auto" />
      <NotificationBell />
      <UserMenu />
      <div className="mt-3 flex flex-col items-center gap-1 text-[10px] font-semibold opacity-80" title={live ? 'Live updates connected' : 'Live updates disconnected'}>
        <span className="relative flex h-2.5 w-2.5">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2bac76] opacity-60" />}
          <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', live ? 'bg-[#2bac76]' : live === false ? 'bg-[#e01e5a]' : 'bg-white/40')} />
        </span>
        {live ? 'Live' : 'Offline'}
      </div>
    </nav>
  );
}

/** Pages whose content depends on the "view as" account. */
const ACCOUNT_PAGES = (p: string) => p === '/' || ['/c/', '/search', '/analytics', '/sync'].some((x) => p.startsWith(x));

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { account } = useWorkspace();
  const showSidebar = pathname === '/' || pathname.startsWith('/c/');
  const showAccounts = ACCOUNT_PAGES(pathname);
  const [open, setOpen] = useState(false);
  return (
    <SidebarCtx.Provider value={{ open, setOpen }}>
      <div className="flex h-dvh overflow-hidden">
        <Rail />
        {showSidebar && (
          <>
            <aside
              className={clsx(
                'z-30 w-[272px] flex-none border-r border-black/10 bg-side text-side-text',
                'max-md:fixed max-md:inset-y-0 max-md:left-[68px] max-md:shadow-pop max-md:transition-transform max-md:duration-300 max-md:ease-out',
                open ? 'max-md:translate-x-0' : 'max-md:-translate-x-[340px]',
              )}
            >
              <ChannelSidebar onNavigate={() => setOpen(false)} />
            </aside>
            {open && <div className="fixed inset-0 z-20 animate-fade-in bg-black/40 backdrop-blur-[1px] md:hidden" onClick={() => setOpen(false)} />}
          </>
        )}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {showAccounts && <AccountTabs />}
          {/* Re-mounted per account, so switching visibly reloads the page for that account's view. */}
          <div key={showAccounts ? (account?.id ?? 'all') : 'page'} className="min-h-0 flex-1 animate-fade-in overflow-hidden">
            {children}
          </div>
        </main>
      </div>
      <NotificationListener />
    </SidebarCtx.Provider>
  );
}

/** Renders the app only once the session is confirmed; a missing session redirects to /login (see fetcher). */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  if (!me) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: true, errorRetryCount: 3 }}>
      {pathname.startsWith('/login') ? (
        children
      ) : (
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      )}
    </SWRConfig>
  );
}
