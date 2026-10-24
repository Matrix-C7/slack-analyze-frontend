'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher, qs, type Channel, type SearchResponse } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtNumber, isDm } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { Avatar } from './Avatar';
import { ChannelIcon } from './ChannelSidebar';
import { MessageMeta, RichText } from './MessageItem';
import { PageHeader } from './PageHeader';

const PAGE_SIZE = 25;

function useUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp.get(k) ?? '';
  const set = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { get, set, sp };
}

const csvToggle = (csv: string, id: string) => {
  const s = new Set(csv.split(',').filter(Boolean));
  s.has(id) ? s.delete(id) : s.add(id);
  return [...s].join(',');
};

function MonthBars({ months }: { months: { month: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (months.length < 2) return null;
  const max = Math.max(...months.map((m) => m.count));
  const h = hover !== null ? months[hover] : null;
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>Matches over time</span>
        <span>{h ? `${new Date(`${h.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}: ${fmtNumber(h.count)}` : ''}</span>
      </div>
      <div className="flex h-12 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {months.map((m, i) => (
          <div key={m.month} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className="w-full rounded-t-[3px]"
              style={{ height: `${Math.max(4, (m.count / max) * 100)}%`, background: 'var(--series-1)', opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{months[0].month}</span>
        <span>{months[months.length - 1].month}</span>
      </div>
    </div>
  );
}

export function SearchView() {
  const { get, set } = useUrlState();
  const router = useRouter();
  const { workspace, account } = useWorkspace();
  const q = get('q');
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const workspaceId = get('workspaceId') || workspace?.id || '';
  // The "view as" account applies unless the URL names another workspace.
  const accountId = workspaceId === workspace?.id ? (account?.id ?? '') : '';
  const filters = {
    q,
    workspaceId,
    accountId,
    channelIds: get('channelIds'),
    userIds: get('userIds'),
    channelTypes: get('channelTypes'),
    from: get('from'),
    to: get('to'),
    hasFiles: get('hasFiles'),
    hasReactions: get('hasReactions'),
    sort: get('sort') || 'relevance',
    page: get('page') || '1',
    pageSize: String(PAGE_SIZE),
  };
  const key = workspaceId ? `/api/search${qs(filters)}` : null;
  const { data, isLoading, error } = useSWR<SearchResponse>(key, fetcher, { keepPreviousData: true });
  const { data: channels } = useSWR<Channel[]>(workspaceId ? `/api/channels${qs({ workspaceId, accountId })}` : null, fetcher);
  const channelName = useMemo(() => new Map((channels ?? []).map((c) => [c.id, c])), [channels]);

  const terms = q.replace(/["()]/g, ' ').split(/\s+/).filter((t) => t && !/^(or|and|-.*)$/i.test(t));
  const page = Number(filters.page);
  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const activeChannels = filters.channelIds.split(',').filter(Boolean);
  const activeUsers = filters.userIds.split(',').filter(Boolean);
  const anyFilter = activeChannels.length || activeUsers.length || filters.from || filters.to || filters.channelTypes || filters.hasFiles || filters.hasReactions;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Search"
        subtitle={
          workspace
            ? `Across ${workspace.name ?? workspace.id}${account && accountId === account.id ? ` · as seen by ${account.name ?? account.id}` : ''}`
            : undefined
        }
      />

      <div className="flex-none border-b border-line px-4 py-3 md:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: draft.trim() || null, sort: draft.trim() ? filters.sort : null });
          }}
          className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 focus-within:border-accent"
        >
          <Search size={18} className="text-muted" />
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='Search messages — try words, "exact phrase", or -exclude'
            className="w-full bg-transparent text-[15px] outline-none"
          />
          {draft && (
            <button type="button" onClick={() => (setDraft(''), set({ q: null }))} aria-label="Clear">
              <X size={16} className="text-muted" />
            </button>
          )}
          <button type="submit" className="rounded-md bg-good px-3 py-1 text-sm font-bold text-white">
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <select
            value={filters.channelTypes}
            onChange={(e) => set({ channelTypes: e.target.value || null })}
            className="rounded-md border border-line bg-bg px-2 py-1"
            aria-label="Conversation type"
          >
            <option value="">All conversations</option>
            <option value="public,private,unknown">Channels only</option>
            <option value="dm,group_dm">DMs only</option>
          </select>
          <label className="flex items-center gap-1 rounded-md border border-line px-2 py-1">
            <span className="text-muted">From</span>
            <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value || null })} className="bg-transparent" />
          </label>
          <label className="flex items-center gap-1 rounded-md border border-line px-2 py-1">
            <span className="text-muted">To</span>
            <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value || null })} className="bg-transparent" />
          </label>
          <select
            value={filters.hasFiles}
            onChange={(e) => set({ hasFiles: e.target.value || null })}
            className="rounded-md border border-line bg-bg px-2 py-1"
            aria-label="Files"
          >
            <option value="">Any files</option>
            <option value="true">With files</option>
            <option value="false">Without files</option>
          </select>
          <select
            value={filters.hasReactions}
            onChange={(e) => set({ hasReactions: e.target.value || null })}
            className="rounded-md border border-line bg-bg px-2 py-1"
            aria-label="Reactions"
          >
            <option value="">Any reactions</option>
            <option value="true">With reactions</option>
          </select>
          <select
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value })}
            className="ml-auto rounded-md border border-line bg-bg px-2 py-1"
            aria-label="Sort"
          >
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {anyFilter ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {activeChannels.map((id) => (
              <button key={id} onClick={() => set({ channelIds: csvToggle(filters.channelIds, id) || null })} className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">
                in: {channelName.get(id)?.name ?? id} <X size={12} />
              </button>
            ))}
            {activeUsers.map((id) => (
              <button key={id} onClick={() => set({ userIds: csvToggle(filters.userIds, id) || null })} className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">
                from: {data?.facets.users.find((u) => u.id === id)?.name ?? id} <X size={12} />
              </button>
            ))}
            <button
              onClick={() => set({ channelIds: null, userIds: null, from: null, to: null, channelTypes: null, hasFiles: null, hasReactions: null })}
              className="text-muted underline"
            >
              Clear all filters
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Facets */}
        <aside className="scroll-slim hidden w-64 flex-none overflow-y-auto border-r border-line p-4 lg:block">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Conversations</h2>
          <ul className="mb-5 space-y-0.5">
            {data?.facets.channels.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => set({ channelIds: csvToggle(filters.channelIds, c.id) || null })}
                  className={clsx('flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-hover', activeChannels.includes(c.id) && 'bg-accent-soft font-bold')}
                >
                  <ChannelIcon type={c.type} size={13} />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-xs text-muted">{fmtNumber(c.count)}</span>
                </button>
              </li>
            ))}
          </ul>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">People</h2>
          <ul className="space-y-0.5">
            {data?.facets.users
              .filter((u) => u.id)
              .map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => set({ userIds: csvToggle(filters.userIds, u.id!) || null })}
                    className={clsx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-hover', activeUsers.includes(u.id!) && 'bg-accent-soft font-bold')}
                  >
                    <Avatar name={u.name} size={18} />
                    <span className="truncate">{u.name ?? u.id}</span>
                    <span className="ml-auto text-xs text-muted">{fmtNumber(u.count)}</span>
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        {/* Results */}
        <section className="scroll-slim min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {error && <p className="text-bad">Search failed: {String((error as Error).message)}</p>}
          {data && (
            <>
              <div className="mb-3 flex items-center gap-2 text-sm text-muted">
                {isLoading && <Loader2 size={14} className="animate-spin" />}
                <span>
                  <b className="text-ink">{fmtNumber(data.total)}</b> {data.total === 1 ? 'message' : 'messages'}
                  {q && (
                    <>
                      {' '}
                      matching <b className="text-ink">“{q}”</b>
                    </>
                  )}
                </span>
              </div>
              <MonthBars months={data.facets.months} />
              <ul className="space-y-2">
                {data.results.map((m) => {
                  const href = `/c/${m.workspaceId}/${m.channelId}${qs({ ts: m.ts, q })}`;
                  // The card is clickable but not an <a>: message text and files contain their own links.
                  return (
                  <li key={m.id}>
                    <div
                      role="link"
                      tabIndex={0}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest('a')) router.push(href);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
                      className="block cursor-pointer rounded-lg border border-line p-3 transition hover:border-accent hover:bg-hover"
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                        <ChannelIcon type={m.channelType} size={12} />
                        <Link href={href} className="font-bold hover:underline">
                          {isDm(m.channelType) ? m.channelName : `#${m.channelName}`}
                        </Link>
                        <span>·</span>
                        <time dateTime={m.sentAt}>{fmtDateTime(m.sentAt)}</time>
                      </div>
                      <div className="flex gap-2">
                        <Avatar name={m.userName} url={m.avatarUrl} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="font-black">{m.userName ?? 'Unknown'}</div>
                          <div className="line-clamp-6 whitespace-pre-wrap break-words text-[15px]">
                            <RichText text={m.text} highlight={terms} />
                          </div>
                          <MessageMeta m={m} />
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
              {data.total === 0 && <p className="py-10 text-center text-muted">No messages match. Try fewer words or remove filters.</p>}
              {pages > 1 && (
                <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, false)} className="rounded-md border border-line p-1.5 disabled:opacity-40" aria-label="Previous page">
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    Page {page} of {fmtNumber(pages)}
                  </span>
                  <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) }, false)} className="rounded-md border border-line p-1.5 disabled:opacity-40" aria-label="Next page">
                    <ChevronRight size={16} />
                  </button>
                </nav>
              )}
            </>
          )}
          {!data && !error && workspaceId && (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {!workspaceId && <p className="text-muted">No workspace captured yet.</p>}
          {data && filters.from && <p className="mt-6 text-center text-xs text-muted">Showing messages from {fmtDate(filters.from)}</p>}
        </section>
      </div>
    </div>
  );
}
