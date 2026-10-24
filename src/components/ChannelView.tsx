'use client';

import { CalendarRange, CheckCircle2, Loader2, Menu, MessagesSquare, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { apiSend, fetcher, qs, type Channel, type ChannelDetail, type Message, type MessagePage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayKey, dayLabel, fmtDate, fmtNumber, fmtRelative, typeLabel } from '@/lib/format';
import { useLiveEvents } from '@/lib/live';
import { useWorkspace } from '@/lib/workspace';
import { useMobileSidebar } from './AppShell';
import { ChannelIcon } from './ChannelSidebar';
import { Confirm } from './admin/ui';
import { MessageItem } from './MessageItem';
import { ThreadPanel } from './ThreadPanel';

const PAGE = 100;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function groupByDay(messages: Message[]): Message[][] {
  const days: Message[][] = [];
  for (const m of messages) {
    const last = days[days.length - 1];
    if (last && dayKey(last[0].sentAt) === dayKey(m.sentAt)) last.push(m);
    else days.push([m]);
  }
  return days;
}

export function ChannelView({ workspaceId, channelId }: { workspaceId: string; channelId: string }) {
  const searchParams = useSearchParams();
  const focusTs = searchParams.get('ts');
  const openThreadTs = searchParams.get('thread'); // set by notifications for thread replies
  const highlight = (searchParams.get('q') ?? '').split(/\s+/).filter(Boolean);
  const { setOpen } = useMobileSidebar();

  const router = useRouter();
  const { account, workspace } = useWorkspace();
  const { isAdmin } = useAuth();

  // Switching "view as" to an account that doesn't have this conversation opens that account's latest one instead.
  // Same SWR key as the sidebar, so the list is shared.
  const accountScoped = Boolean(account) && workspace?.id === workspaceId;
  const { data: accountChannels } = useSWR<Channel[]>(
    accountScoped ? `/api/channels${qs({ workspaceId, accountId: account?.id })}` : null,
    fetcher,
  );
  useEffect(() => {
    if (!accountScoped || !accountChannels || accountChannels.some((c) => c.id === channelId)) return;
    const latest = accountChannels
      .filter((c) => c.lastMessageAt)
      .sort((a, b) => b.lastMessageAt!.localeCompare(a.lastMessageAt!))[0];
    router.replace(latest ? `/c/${workspaceId}/${latest.id}` : '/');
  }, [accountScoped, accountChannels, channelId, workspaceId, router]);
  const { mutate: mutateThread } = useSWRConfig();
  const [threadOf, setThreadOf] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  useEffect(() => setThreadOf(null), [workspaceId, channelId]);
  const base = `/api/channels/${workspaceId}/${channelId}`;
  const {
    data: channel,
    error: channelError,
    mutate: refreshChannel,
  } = useSWR<ChannelDetail>(`${base}${qs({ accountId: account?.id })}`, fetcher);

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loading, setLoading] = useState<'initial' | 'older' | 'newer' | null>('initial');
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ ts: string; offset: number } | null>(null);
  const stickToBottom = useRef(true);

  // Initial load (latest page, or a window around ?ts=)
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setLoading('initial');
    setError(null);
    stickToBottom.current = !focusTs;
    fetcher<MessagePage>(`${base}/messages${qs({ limit: PAGE, around: focusTs })}`)
      .then((page) => {
        if (cancelled) return;
        setMessages(page.messages);
        setHasOlder(page.hasOlder);
        const parent = openThreadTs ? page.messages.find((m) => m.ts === openThreadTs) : undefined;
        if (parent) setThreadOf(parent);
        setHasNewer(page.hasNewer);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(null));
    return () => {
      cancelled = true;
    };
  }, [base, focusTs, openThreadTs]);

  // Scroll positioning after renders
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (anchor.current) {
      // Keep the previously-first visible message in place after prepending older messages.
      const node = el.querySelector<HTMLElement>(`[data-ts="${anchor.current.ts}"]`);
      if (node) el.scrollTop = node.offsetTop - anchor.current.offset;
      anchor.current = null;
    } else if (focusTs && loading === null) {
      document.getElementById(`msg-${focusTs}`)?.scrollIntoView({ block: 'center' });
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, focusTs, loading]);

  const loadOlder = useCallback(async () => {
    if (!hasOlder || loading || !messages.length) return;
    const el = scroller.current!;
    const firstTs = messages[0].ts;
    const node = el.querySelector<HTMLElement>(`[data-ts="${firstTs}"]`);
    anchor.current = { ts: firstTs, offset: (node?.offsetTop ?? 0) - el.scrollTop };
    setLoading('older');
    try {
      const page = await fetcher<MessagePage>(`${base}/messages${qs({ limit: PAGE, before: firstTs })}`);
      setMessages((prev) => [...page.messages, ...prev]);
      setHasOlder(page.hasOlder);
    } catch (e) {
      anchor.current = null;
      setError(String((e as Error).message));
    } finally {
      setLoading(null);
    }
  }, [base, hasOlder, loading, messages]);

  const loadNewer = useCallback(async () => {
    if (loading || !messages.length) return;
    setLoading('newer');
    try {
      const page = await fetcher<MessagePage>(`${base}/messages${qs({ limit: PAGE, after: messages[messages.length - 1].ts })}`);
      if (page.messages.length) setMessages((prev) => [...prev, ...page.messages]);
      setHasNewer(page.hasNewer);
    } finally {
      setLoading(null);
    }
  }, [base, loading, messages]);

  const onScroll = () => {
    const el = scroller.current!;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 300) loadOlder();
    if (hasNewer && el.scrollHeight - el.scrollTop - el.clientHeight < 300) loadNewer();
  };

  // Live: new messages for this channel arrive from the extension.
  useLiveEvents((e) => {
    if (e.type !== 'messages' || e.data.workspaceId !== workspaceId || e.data.channelId !== channelId) return;
    refreshChannel();
    if (!hasNewer && messages.length) {
      // Refresh the tail (picks up new messages and edits/reactions on recent ones).
      const tailFrom = messages[Math.max(0, messages.length - 20)].ts;
      fetcher<MessagePage>(`${base}/messages${qs({ limit: 200, around: tailFrom })}`).then((page) => {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.ts, m]));
          for (const m of page.messages) map.set(m.ts, m);
          return [...map.values()].sort((a, b) => Number(a.ts) - Number(b.ts));
        });
      });
    } else if (!messages.length) {
      fetcher<MessagePage>(`${base}/messages${qs({ limit: PAGE })}`).then((page) => {
        setMessages(page.messages);
        setHasOlder(page.hasOlder);
        const parent = openThreadTs ? page.messages.find((m) => m.ts === openThreadTs) : undefined;
        if (parent) setThreadOf(parent);
      });
    }
  });

  const name = channel?.name ?? channelId;

  const deleteMessage = isAdmin ? (m: Message) => setDeleting(m) : undefined;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex flex-none items-center gap-3 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur md:px-5">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open conversations">
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-lg font-black">
              {channel && <ChannelIcon type={channel.type} size={17} />}
              <span className="truncate">{name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted">
              {channel && <span>{typeLabel(channel.type)}</span>}
              {channel?.topic && <span className="max-w-md truncate">{channel.topic}</span>}
              {channel && (
                <>
                  <span className="flex items-center gap-1">
                    <MessagesSquare size={12} /> {fmtNumber(channel.messageCount)} messages
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {channel.memberCount} people
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarRange size={12} /> since {fmtDate(channel.firstMessageAt)}
                  </span>
                  <span>synced {fmtRelative(channel.lastSyncedAt)}</span>
                  {channel.accounts.length > 0 && (
                    <span title="Slack accounts whose browsers captured this conversation">
                      via {channel.accounts.map((a) => a.name).join(', ')}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <Link
            href={`/search${qs({ channelIds: channelId, workspaceId })}`}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold shadow-card transition hover:border-accent/40 hover:bg-hover"
          >
            <Search size={15} /> <span className="max-sm:hidden">Search in channel</span>
          </Link>
        </header>

        {/* Messages */}
        <div ref={scroller} onScroll={onScroll} className="scroll-slim flex-1 overflow-y-auto pb-4">
          {channelError && <p className="p-6 text-bad">Could not load this conversation.</p>}
          {error && <p className="p-6 text-bad">{error}</p>}

          {!hasOlder && loading === null && messages.length > 0 && (
            <div className="px-5 pb-4 pt-10">
              <div className="mb-1 text-2xl font-black">{channel?.type === 'dm' ? name : `#${name}`}</div>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                {channel?.reachedStart ? (
                  <>
                    <CheckCircle2 size={14} className="text-good" /> This is the very beginning of the conversation.
                  </>
                ) : (
                  <>Oldest captured message. Sync a longer range in the extension to go further back.</>
                )}
              </p>
            </div>
          )}
          {loading === 'older' && (
            <div className="flex justify-center py-3 text-muted">
              <Loader2 className="animate-spin" size={18} />
            </div>
          )}
          {loading === 'initial' && (
            <div className="flex h-full flex-col justify-end gap-5 px-5 pb-2" aria-label="Loading messages">
              {[78, 46, 90, 62, 38, 70].map((w, i) => (
                <div key={i} className="flex gap-2">
                  <div className="skeleton h-9 w-9 flex-none" />
                  <div className="flex-1 space-y-2 pt-0.5">
                    <div className="skeleton h-3.5 w-36" />
                    <div className="skeleton h-3.5" style={{ width: `${w}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {loading === null && messages.length === 0 && !error && (
            <div className="flex h-full items-center justify-center p-6 text-center text-muted">
              No messages captured for this conversation yet.
            </div>
          )}

          {/* One section per day so each sticky divider pushes the previous one away. */}
          {groupByDay(messages).map((day) => (
            <section key={day[0].ts}>
              <div className="sticky top-0 z-10 flex items-center py-2">
                <div className="h-px flex-1 bg-line" />
                <span className="rounded-full border border-line bg-bg px-3 py-0.5 text-[13px] font-bold shadow-card">{dayLabel(day[0].sentAt)}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
              {day.map((m, i) => {
                const prev = day[i - 1];
                const compact =
                  !!prev &&
                  prev.userId === m.userId &&
                  prev.userName === m.userName &&
                  new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() < GROUP_WINDOW_MS;
                return (
                  <MessageItem
                    key={m.ts}
                    m={m}
                    compact={compact}
                    highlighted={m.ts === focusTs}
                    highlight={highlight}
                    onOpenThread={m.replyCount > 0 ? () => setThreadOf(m) : undefined}
                    onDelete={deleteMessage ? () => deleteMessage(m) : undefined}
                  />
                );
              })}
            </section>
          ))}

          {loading === 'newer' && (
            <div className="flex justify-center py-3 text-muted">
              <Loader2 className="animate-spin" size={18} />
            </div>
          )}
          {hasNewer && loading === null && (
            <div className="flex justify-center py-3">
              <Link
                href={`/c/${workspaceId}/${channelId}`}
                className="animate-slide-up rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-white shadow-pop transition hover:brightness-110"
              >
                Jump to latest
              </Link>
            </div>
          )}
        </div>
      </div>
      {threadOf && (
        <ThreadPanel
          key={threadOf.ts}
          workspaceId={workspaceId}
          channelId={channelId}
          parent={threadOf}
          onClose={() => setThreadOf(null)}
          onDelete={deleteMessage}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete message"
          body={
            <>
              Permanently delete this message{deleting.replyCount > 0 ? ' and its thread replies' : ''} from the archive? It will not be
              captured again.
              <blockquote className="mt-2 line-clamp-3 border-l-2 border-line pl-2 text-muted">
                <b>{deleting.userName ?? 'Unknown'}:</b> {deleting.text || '(no text)'}
              </blockquote>
            </>
          }
          confirmLabel="Delete message"
          onConfirm={async () => {
            await apiSend('DELETE', `/api/admin/messages/${deleting.id}`);
            setMessages((list) => list.filter((x) => x.id !== deleting.id));
            if (threadOf?.id === deleting.id) setThreadOf(null);
            mutateThread(`/api/channels/${workspaceId}/${channelId}/threads/${threadOf?.ts}`);
            refreshChannel();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
