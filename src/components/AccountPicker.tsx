'use client';

import clsx from 'clsx';
import { EyeOff, Users } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Account } from '@/lib/api';
import { fmtNumber, fmtRelative } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { Avatar } from './Avatar';

function accountStatus(a: Account) {
  const convs = `${fmtNumber(a.channelCount)} conversation${a.channelCount === 1 ? '' : 's'}`;
  if (a.online) return `${convs} · browser online`;
  return a.lastSyncedAt ? `${convs} · synced ${fmtRelative(a.lastSyncedAt)}` : convs;
}

/**
 * "View as" tabs above the main content: "All accounts" plus one tab per Slack account (avatar, name, status).
 * Switching changes what the sidebar, conversation view, search, analytics and sync pages show.
 */
export function AccountTabs({ className }: { className?: string }) {
  const { accounts, account, setAccountId } = useWorkspace();
  const bar = useRef<HTMLDivElement>(null);

  // Keep the selected tab in view when the bar scrolls horizontally.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [account?.id]);

  if (accounts.length === 0) return null;

  const tab = (key: string, active: boolean, onClick: () => void, icon: React.ReactNode, title: string, subtitle: string, hidden = false) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={hidden ? `${title} — ${subtitle} — hidden from viewers` : `${title} — ${subtitle}`}
      className={clsx(
        'group relative flex w-max max-w-[136px] flex-none items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition duration-150',
        active
          ? 'bg-bg shadow-card ring-1 ring-line'
          : 'text-muted hover:bg-bg/80 hover:text-ink',
        hidden && !active && 'opacity-60',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className={clsx('flex items-center gap-1 truncate text-[12.5px] font-semibold leading-4', active ? 'text-ink' : 'text-ink/85')}>
          <span className="truncate">{title}</span>
          {/* Only admins receive hidden accounts; mark them so it's clear viewers don't see them. */}
          {hidden && <EyeOff size={11} className="flex-none text-warn" aria-label="hidden from viewers" />}
        </span>
        <span className="block truncate text-[10.5px] leading-4 text-muted">{subtitle}</span>
      </span>
      <span
        className={clsx(
          'absolute inset-x-2 -bottom-2 h-0.5 rounded-full transition-all duration-200',
          active ? 'bg-accent opacity-100' : 'bg-transparent opacity-0',
        )}
        aria-hidden
      />
    </button>
  );

  return (
    <div className={clsx('flex-none border-b border-line bg-subtle', className)}>
      <div className="flex items-center gap-2 px-3 pt-1.5 md:px-4">
        <span className="flex-none text-[10px] font-semibold uppercase tracking-[0.06em] text-muted max-sm:hidden">View as</span>
        <div ref={bar} role="tablist" aria-label="View as Slack account" className="scroll-slim flex min-w-0 flex-1 gap-1 overflow-x-auto pb-2">
          {tab(
            'all',
            !account,
            () => setAccountId(null),
            <span className={clsx('grid h-6 w-6 flex-none place-items-center rounded-md', !account ? 'bg-accent text-white' : 'bg-hover text-muted')}>
              <Users size={13} />
            </span>,
            'All accounts',
            `${accounts.length} account${accounts.length === 1 ? '' : 's'} combined`,
          )}
          {accounts.map((a) =>
            tab(
              a.id,
              account?.id === a.id,
              () => setAccountId(a.id),
              <span className="relative flex-none">
                <Avatar name={a.name ?? a.id} url={a.avatarUrl} size={24} className={clsx(a.isHidden && 'grayscale')} />
                {a.online && <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border border-bg bg-[#2bac76]" aria-label="online" />}
              </span>,
              a.name ?? a.id,
              accountStatus(a),
              a.isHidden,
            ),
          )}
        </div>
      </div>
    </div>
  );
}
