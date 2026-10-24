'use client';

import clsx from 'clsx';
import { AtSign, ChevronDown, EyeOff, Hash, Lock, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher, qs, type Channel, type ConversationType } from '@/lib/api';
import { fmtCompact, isDm } from '@/lib/format';
import { useLiveEvents } from '@/lib/live';
import { useWorkspace } from '@/lib/workspace';
import { Avatar, WorkspaceLogo } from './Avatar';

export function ChannelIcon({ type, size = 15 }: { type: ConversationType; size?: number }) {
  if (type === 'private') return <Lock size={size - 1} />;
  if (type === 'group_dm') return <Users size={size} />;
  if (type === 'dm') return <AtSign size={size} />;
  return <Hash size={size} />;
}

type SortMode = 'name' | 'activity';

function Section({
  title,
  channels,
  activeId,
  workspaceId,
  onNavigate,
}: {
  title: string;
  channels: Channel[];
  activeId?: string;
  workspaceId: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1 rounded-md px-2 py-1 text-[14px] font-semibold transition-colors hover:bg-side-hover"
        aria-expanded={open}
      >
        <ChevronDown size={15} className={clsx('transition-transform duration-200', !open && '-rotate-90')} />
        <span>{title}</span>
        <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[11px] font-bold tabular-nums opacity-80">{channels.length}</span>
      </button>
      {open && (
        <ul className="mt-0.5 animate-fade-in">
          {channels.map((c) => {
            const active = c.id === activeId;
            const empty = c.messageCount === 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/c/${workspaceId}/${c.id}`}
                  onClick={onNavigate}
                  className={clsx(
                    'mx-2 flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[15px] transition-colors duration-100',
                    active ? 'bg-side-active font-semibold text-white shadow-sm' : 'hover:bg-side-hover hover:text-white',
                    empty && !active && 'opacity-50',
                  )}
                  title={`${c.name} · ${c.messageCount} messages${
                    c.accounts.length ? ` · captured by ${c.accounts.map((a) => a.name).join(', ')}` : ''
                  }`}
                >
                  {c.type === 'dm' ? (
                    <Avatar name={c.name} size={18} />
                  ) : (
                    <span className="w-[18px] flex-none opacity-80">
                      <ChannelIcon type={c.type} />
                    </span>
                  )}
                  <span className="truncate">{c.name}</span>
                  {c.isHidden && (
                    <span title="Hidden from viewers" className="flex-none opacity-70">
                      <EyeOff size={13} />
                    </span>
                  )}
                  {c.messageCount > 0 && <span className="ml-auto text-xs tabular-nums opacity-60">{fmtCompact(c.messageCount)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ChannelSidebar({ onNavigate }: { onNavigate: () => void }) {
  const { workspace, account } = useWorkspace();
  const params = useParams<{ channelId?: string }>();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortMode>('name');
  const key = workspace ? `/api/channels${qs({ workspaceId: workspace.id, accountId: account?.id })}` : null;
  const { data, mutate } = useSWR<Channel[]>(key, fetcher);

  // Refresh counts when the extension sends data for this workspace.
  useLiveEvents((e) => {
    if (e.type === 'messages' && e.data.workspaceId === workspace?.id) mutate();
  });

  const { channels, dms } = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (data ?? []).filter((c) => !f || c.name.toLowerCase().includes(f));
    list.sort((a, b) =>
      sort === 'activity'
        ? (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
        : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    return { channels: list.filter((c) => !isDm(c.type)), dms: list.filter((c) => isDm(c.type)) };
  }, [data, filter, sort]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          {workspace && <WorkspaceLogo workspace={workspace} size={36} className="shadow-sm ring-1 ring-white/15" />}
          <div className="min-w-0 flex-1">
            {/* Communities are switched with the logo buttons in the rail. */}
            <div className="truncate text-[17px] font-black text-white">{workspace?.name ?? workspace?.id ?? 'Slack Analyze'}</div>
            {workspace && (
              <div className="truncate text-xs opacity-70">
                {workspace.domain ? `${workspace.domain}.slack.com · ` : ''}
                {fmtCompact(workspace.messageCount)} messages
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <label className="flex flex-1 items-center gap-2 rounded-md bg-white/10 px-2 py-1.5 ring-white/30 transition focus-within:bg-white/15 focus-within:ring-1">
          <Search size={14} className="opacity-70" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find conversation"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/50 outline-none"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-md bg-white/10 px-1.5 py-1.5 text-xs outline-none transition-colors hover:bg-white/15"
          aria-label="Sort conversations"
        >
          <option value="name" className="text-black">A–Z</option>
          <option value="activity" className="text-black">Recent</option>
        </select>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto pb-6 pt-1">
        {!workspace && <p className="px-4 text-sm opacity-70">No workspace captured yet.</p>}
        {workspace && !data && (
          <div className="space-y-2.5 px-5 pt-2" aria-hidden>
            {[70, 55, 82, 48, 64, 76, 52, 60].map((w, i) => (
              <div key={i} className="skeleton skeleton-dark h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {workspace && data && (
          <>
            <Section title="Channels" channels={channels} activeId={params.channelId} workspaceId={workspace.id} onNavigate={onNavigate} />
            <Section title="Direct messages" channels={dms} activeId={params.channelId} workspaceId={workspace.id} onNavigate={onNavigate} />
          </>
        )}
      </div>
    </div>
  );
}
