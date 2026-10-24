'use client';

import clsx from 'clsx';
import { Download, Eye, EyeOff, Ban, CircleCheck, Eraser, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { API_URL, apiSend, fetcher, qs } from '@/lib/api';
import type { AdminAccount, AdminChannel, AdminCollector, AdminWorkspace } from '@/lib/admin';
import { fmtDate, fmtNumber, fmtRelative } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { Avatar, WorkspaceLogo } from '../Avatar';
import { ChannelIcon } from '../ChannelSidebar';
import { Badge, Button, Card, Confirm, Field, Modal, Switch, Td, Th, errorText, inputCls, useNotice } from './ui';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'excluded', label: 'Excluded' },
  { id: 'incomplete', label: 'Partial history' },
  { id: 'empty', label: 'Not captured' },
] as const;

const PAGE = 100;

type BulkAction = 'hide' | 'unhide' | 'exclude' | 'include' | 'purge';

function WorkspacePanel({ ws, onChanged, notice }: { ws: AdminWorkspace; onChanged: () => void; notice: ReturnType<typeof useNotice> }) {
  const [retention, setRetention] = useState(ws.retentionDays ? String(ws.retentionDays) : '');
  const [confirm, setConfirm] = useState<'retention' | 'delete' | null>(null);
  useEffect(() => setRetention(ws.retentionDays ? String(ws.retentionDays) : ''), [ws.retentionDays]);
  const nextRetention = retention.trim() ? Number(retention) : null;
  const exportUrl = (format: 'json' | 'csv') => `${API_URL}/api/admin/export${qs({ workspaceId: ws.id, format })}`;

  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <WorkspaceLogo workspace={ws} size={28} />
          <span className="truncate">{ws.name ?? ws.id}</span>
          {ws.domain && <span className="truncate text-sm font-normal text-muted">{ws.domain}.slack.com</span>}
        </span>
      }
    >
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Stored</div>
          <div className="mt-1">
            <b className="tabular-nums">{fmtNumber(ws.messageCount)}</b> messages in <b className="tabular-nums">{fmtNumber(ws.channelCount)}</b> conversations
          </div>
          <div className="text-muted">Oldest message {fmtDate(ws.oldestMessageAt)}</div>
          <div className="text-xs text-muted">Workspace id {ws.id}</div>
        </div>
        <div>
          <Field label="Retention (days)" hint="Messages older than this are deleted now and never stored again. Empty = keep everything.">
            <div className="flex gap-2">
              <input type="number" min={1} placeholder="keep all" value={retention} onChange={(e) => setRetention(e.target.value)} className={inputCls} />
              <Button disabled={nextRetention === ws.retentionDays} onClick={() => setConfirm('retention')}>
                Apply
              </Button>
            </div>
          </Field>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Export</div>
          <div className="flex flex-wrap gap-2">
            <a href={exportUrl('csv')} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-hover">
              <Download size={14} /> CSV
            </a>
            <a href={exportUrl('json')} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-hover">
              <Download size={14} /> JSON
            </a>
            <Button variant="ghost" className="text-bad" onClick={() => setConfirm('delete')}>
              <Trash2 size={14} /> Delete workspace
            </Button>
          </div>
        </div>
      </div>
      {confirm === 'retention' && (
        <Confirm
          title="Apply retention"
          danger={nextRetention !== null}
          body={
            nextRetention ? (
              <>
                Messages older than <b>{nextRetention} days</b> will be <b>permanently deleted</b> now, and older messages will be ignored by future syncs.
              </>
            ) : (
              <>Remove the retention limit? Future syncs will store messages of any age.</>
            )
          }
          confirmLabel="Apply"
          onConfirm={async () => {
            const res = await apiSend<{ purged: number }>('PATCH', `/api/admin/workspaces/${ws.id}`, { retentionDays: nextRetention });
            notice.ok(`Retention saved${res.purged ? ` · ${fmtNumber(res.purged)} messages deleted` : ''}`);
            onChanged();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'delete' && (
        <Confirm
          title="Delete workspace"
          body={
            <>
              Permanently delete <b>everything</b> stored for {ws.name ?? ws.id}: {fmtNumber(ws.messageCount)} messages, conversations, accounts and sync
              history. Browsers that still capture it will start filling it again.
            </>
          }
          confirmText={ws.name ?? ws.id}
          confirmLabel="Delete workspace"
          onConfirm={async () => {
            await apiSend('DELETE', `/api/admin/workspaces/${ws.id}`);
            notice.ok('Workspace deleted');
            onChanged();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </Card>
  );
}

/** Show / hide each captured Slack account of a community for viewers (the "view as" picker, credits, lists). */
function AccountsPanel({ ws, notice }: { ws: AdminWorkspace; notice: ReturnType<typeof useNotice> }) {
  const key = `/api/admin/accounts${qs({ workspaceId: ws.id })}`;
  const { data: accounts, mutate } = useSWR<AdminAccount[]>(key, fetcher);
  const { mutate: mutateAll } = useSWRConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const hiddenCount = accounts?.filter((a) => a.isHidden).length ?? 0;

  const toggle = async (a: AdminAccount) => {
    setBusy(a.id);
    // Optimistic: flip the switch right away, roll back on failure.
    mutate((list) => list?.map((x) => (x.id === a.id ? { ...x, isHidden: !a.isHidden } : x)), { revalidate: false });
    try {
      await apiSend('PATCH', `/api/admin/accounts/${ws.id}/${encodeURIComponent(a.id)}`, { isHidden: !a.isHidden });
      notice.ok(`${a.name ?? a.id} is now ${a.isHidden ? 'shown to' : 'hidden from'} viewers`);
      // Refresh the "view as" picker everywhere.
      mutateAll((k) => typeof k === 'string' && k.startsWith('/api/accounts'));
    } catch (e) {
      notice.fail(e);
    } finally {
      setBusy(null);
      mutate();
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Slack accounts
          {accounts && <span className="text-sm font-normal text-muted">{accounts.length - hiddenCount} shown · {hiddenCount} hidden</span>}
        </span>
      }
    >
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        These switches apply to <b>every</b> viewer: hidden accounts disappear from the &ldquo;view as&rdquo; picker, conversation credits, browser
        and sync lists. To choose accounts for one person, use Admin → Users → Edit → Slack accounts. Captured messages stay visible under
        &ldquo;All accounts&rdquo;. Admins still see everything.
      </p>
      <ul className="divide-y divide-line">
        {accounts?.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              role="switch"
              aria-checked={!a.isHidden}
              aria-label={`Show ${a.name ?? a.id} to viewers`}
              disabled={busy === a.id}
              onClick={() => toggle(a)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-hover disabled:cursor-wait"
            >
              <span className="relative">
                <Avatar name={a.name ?? a.id} url={a.avatarUrl} size={32} className={clsx('transition', a.isHidden && 'opacity-40 grayscale')} />
                {a.online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-[#2bac76]" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={clsx('flex items-center gap-2 font-semibold', a.isHidden && 'text-muted')}>
                  <span className="truncate">{a.name ?? a.id}</span>
                  {a.isHidden && (
                    <Badge tone="warn">
                      <EyeOff size={11} /> hidden
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-xs text-muted">
                  {a.id} · {fmtNumber(a.channelCount)} conversations · synced {fmtRelative(a.lastSyncedAt)}
                </span>
              </span>
              <span className="hidden text-xs font-semibold text-muted sm:block">{a.isHidden ? 'Hidden' : 'Shown'}</span>
              <Switch on={!a.isHidden} />
            </button>
          </li>
        ))}
        {accounts?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No Slack accounts captured for this community yet.</li>}
        {!accounts && (
          <li className="space-y-3 px-4 py-3" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-8 w-8" />
                <div className="skeleton h-3.5 w-48" />
              </div>
            ))}
          </li>
        )}
      </ul>
    </Card>
  );
}

/** Queues a "sync these conversations" command on one browser. */
function SyncWithBrowser({ workspaceId, channelIds, onClose, onSent }: { workspaceId: string; channelIds: string[]; onClose: () => void; onSent: (m: string) => void }) {
  const { data: collectors } = useSWR<AdminCollector[]>('/api/admin/collectors', fetcher);
  const usable = (collectors ?? []).filter((k) => k.status === 'active' && k.workspaceId === workspaceId);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!pick && usable.length) setPick((usable.find((k) => k.online) ?? usable[0]).id);
  }, [usable, pick]);
  return (
    <Modal
      title={`Sync ${channelIds.length} conversation(s)`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!pick}
            onClick={async () => {
              setBusy(true);
              try {
                await apiSend('POST', `/api/admin/collectors/${pick}/commands`, { type: 'sync_channels', payload: { channelIds } });
                onSent('Sync queued — the browser picks it up within a minute');
                onClose();
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            Queue sync
          </Button>
        </>
      }
    >
      {usable.length === 0 ? (
        <p className="text-sm text-muted">No active browser captures this workspace.</p>
      ) : (
        <Field label="Browser" hint="It uses its own range and settings. The Slack account must be able to see these conversations.">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
            {usable.map((k) => (
              <option key={k.id} value={k.id}>
                {k.online ? '● ' : '○ '}
                {k.label || k.browser} — {k.accountName ?? k.accountId}
              </option>
            ))}
          </select>
        </Field>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}

export function AdminContent() {
  const { workspace: current } = useWorkspace();
  const notice = useNotice();
  const { data: workspaces, mutate: refreshWs } = useSWR<AdminWorkspace[]>('/api/admin/workspaces', fetcher);
  const [wsId, setWsId] = useState<string | null>(null);
  const ws = workspaces?.find((w) => w.id === wsId) ?? workspaces?.find((w) => w.id === current?.id) ?? workspaces?.[0] ?? null;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ action: BulkAction | 'delete'; ids: string[]; purgeBefore?: string } | null>(null);
  const [syncIds, setSyncIds] = useState<string[] | null>(null);
  const [purgeFor, setPurgeFor] = useState<AdminChannel | null>(null);
  const [purgeBefore, setPurgeBefore] = useState('');

  const { data: pages, size, setSize, isValidating, mutate } = useSWRInfinite<AdminChannel[]>(
    (i, prev: AdminChannel[] | null) => {
      if (!ws || (prev && prev.length < PAGE)) return null;
      return `/api/admin/channels${qs({ workspaceId: ws.id, q, filter, limit: PAGE, offset: i * PAGE })}`;
    },
    fetcher,
    { keepPreviousData: true },
  );
  const channels = useMemo(() => pages?.flat(), [pages]);
  const more = pages?.at(-1)?.length === PAGE;
  const loadingMore = isValidating && !!pages && size > pages.length;
  useEffect(() => setSelected(new Set()), [ws?.id, filter, q]);
  const byId = useMemo(() => new Map((channels ?? []).map((c) => [c.id, c])), [channels]);

  // Infinite scroll: fetch the next page when the sentinel below the table comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && !isValidating && setSize((n) => n + 1), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, isValidating, setSize]);
  const refresh = () => {
    mutate();
    refreshWs();
  };

  const run = async (action: BulkAction, ids: string[]) => {
    const res = await apiSend<{ affected: number }>('POST', '/api/admin/channels/bulk', { workspaceId: ws!.id, channelIds: ids, action });
    notice.ok(action === 'purge' ? `${fmtNumber(res.affected)} messages deleted` : `${res.affected} conversation(s) updated`);
    setSelected(new Set());
    refresh();
  };
  const quick = async (action: BulkAction, ids: string[]) => {
    try {
      await run(action, ids);
    } catch (e) {
      notice.fail(e);
    }
  };

  const allChecked = !!channels?.length && channels.every((c) => selected.has(c.id));
  const sel = [...selected];
  const names = (ids: string[]) => ids.map((id) => byId.get(id)?.name ?? id);

  return (
    <div className="space-y-4">
      {workspaces && workspaces.length > 1 && (
        <select value={ws?.id ?? ''} onChange={(e) => setWsId(e.target.value)} className={`${inputCls} max-w-xs`} aria-label="Workspace">
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name ?? w.id}
            </option>
          ))}
        </select>
      )}
      {ws && <WorkspacePanel ws={ws} onChanged={refresh} notice={notice} />}
      {ws && <AccountsPanel key={ws.id} ws={ws} notice={notice} />}
      {workspaces?.length === 0 && <p className="text-muted">No workspaces captured yet.</p>}

      {ws && (
        <Card
          title="Conversations"
          actions={
            <label className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm">
              <Search size={14} className="text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or id" className="w-40 bg-transparent outline-none" />
            </label>
          }
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={clsx('rounded-full px-3 py-1 text-xs font-bold', filter === f.id ? 'bg-ink text-bg' : 'bg-subtle text-muted hover:bg-hover')}
                aria-pressed={filter === f.id}
              >
                {f.label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted">{sel.length} selected</span>
              <Button variant="ghost" disabled={!sel.length} onClick={() => quick('hide', sel)} title="Hide from viewers">
                <EyeOff size={14} /> Hide
              </Button>
              <Button variant="ghost" disabled={!sel.length} onClick={() => quick('unhide', sel)} title="Show to viewers">
                <Eye size={14} /> Unhide
              </Button>
              <Button variant="ghost" disabled={!sel.length} onClick={() => quick('exclude', sel)} title="Stop capturing">
                <Ban size={14} /> Exclude
              </Button>
              <Button variant="ghost" disabled={!sel.length} onClick={() => quick('include', sel)} title="Capture again">
                <CircleCheck size={14} /> Include
              </Button>
              <Button variant="ghost" disabled={!sel.length} onClick={() => setSyncIds(sel)} title="Ask a browser to sync these">
                <RefreshCw size={14} /> Sync
              </Button>
              <Button variant="ghost" className="text-bad" disabled={!sel.length} onClick={() => setConfirm({ action: 'purge', ids: sel })}>
                <Eraser size={14} /> Purge
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-subtle">
                <tr>
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(channels?.map((c) => c.id)))}
                    />
                  </Th>
                  <Th>Conversation</Th>
                  <Th>Flags</Th>
                  <Th className="text-right">Messages</Th>
                  <Th className="text-right">Replies</Th>
                  <Th>Span</Th>
                  <Th>History</Th>
                  <Th>Last synced</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {channels?.map((c) => (
                  <tr key={c.id} className={clsx('border-t border-line', selected.has(c.id) && 'bg-accent-soft')}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name}`}
                        checked={selected.has(c.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                          setSelected(next);
                        }}
                      />
                    </Td>
                    <Td>
                      <Link href={`/c/${ws.id}/${c.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                        <ChannelIcon type={c.type} size={13} /> <span className="max-w-[240px] truncate">{c.name}</span>
                      </Link>
                      <div className="text-xs text-muted">
                        {c.id} · {c.accountCount} account(s)
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {c.isHidden && <Badge tone="warn">hidden</Badge>}
                        {c.captureExcluded && <Badge tone="bad">excluded</Badge>}
                        {!c.isHidden && !c.captureExcluded && <span className="text-muted">—</span>}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{fmtNumber(c.messageCount)}</Td>
                    <Td className="text-right tabular-nums">{fmtNumber(c.replyCount)}</Td>
                    <Td className="whitespace-nowrap text-muted">
                      {c.firstMessageAt ? `${fmtDate(c.firstMessageAt)} – ${fmtDate(c.lastMessageAt)}` : '—'}
                    </Td>
                    <Td>
                      {c.reachedStart ? <Badge tone="good">complete</Badge> : c.messageCount ? <Badge>partial</Badge> : <Badge>none</Badge>}
                    </Td>
                    <Td>{fmtRelative(c.lastSyncedAt)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" title={c.isHidden ? 'Unhide' : 'Hide from viewers'} onClick={() => quick(c.isHidden ? 'unhide' : 'hide', [c.id])}>
                          {c.isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </Button>
                        <Button variant="ghost" title={c.captureExcluded ? 'Include in capture' : 'Exclude from capture'} onClick={() => quick(c.captureExcluded ? 'include' : 'exclude', [c.id])}>
                          {c.captureExcluded ? <CircleCheck size={14} /> : <Ban size={14} />}
                        </Button>
                        <Button variant="ghost" title="Sync with a browser" onClick={() => setSyncIds([c.id])}>
                          <RefreshCw size={14} />
                        </Button>
                        <a
                          href={`${API_URL}/api/admin/export${qs({ workspaceId: ws.id, channelId: c.id, format: 'csv' })}`}
                          title="Export CSV"
                          className="inline-flex items-center rounded-md px-3 py-1.5 hover:bg-hover"
                        >
                          <Download size={14} />
                        </a>
                        <Button variant="ghost" title="Delete messages" className="text-bad" onClick={() => (setPurgeBefore(''), setPurgeFor(c))}>
                          <Eraser size={14} />
                        </Button>
                        <Button variant="ghost" title="Delete conversation" className="text-bad" onClick={() => setConfirm({ action: 'delete', ids: [c.id] })}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
                {channels?.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted">
                      No conversations match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div ref={sentinel} className="flex justify-center border-t border-line p-3 text-xs text-muted">
            {loadingMore ? (
              <Loader2 size={16} className="animate-spin" />
            ) : more ? (
              <Button variant="ghost" onClick={() => setSize(size + 1)}>
                Load more
              </Button>
            ) : (
              !!channels?.length && <span>All {fmtNumber(channels.length)} conversations loaded</span>
            )}
          </div>
        </Card>
      )}

      {purgeFor && ws && (
        <Modal
          title={`Delete messages · ${purgeFor.name}`}
          onClose={() => setPurgeFor(null)}
          footer={
            <>
              <Button onClick={() => setPurgeFor(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirm({ action: 'purge', ids: [purgeFor.id], purgeBefore: purgeBefore || undefined });
                  setPurgeFor(null);
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          <Field label="Delete messages sent before" hint="Leave empty to delete all of this conversation's messages.">
            <input type="date" value={purgeBefore} onChange={(e) => setPurgeBefore(e.target.value)} className={inputCls} />
          </Field>
          <p className="text-xs text-muted">Purged messages can be captured again by a later sync. To stop that, also exclude the conversation.</p>
        </Modal>
      )}
      {confirm && ws && (
        <Confirm
          title={confirm.action === 'delete' ? 'Delete conversation' : 'Delete messages'}
          body={
            confirm.action === 'delete' ? (
              <>
                Permanently delete <b>{names(confirm.ids).join(', ')}</b> with all its messages. A later sync will add it again unless you exclude it
                first.
              </>
            ) : (
              <>
                Permanently delete {confirm.purgeBefore ? <>messages sent before <b>{fmtDate(`${confirm.purgeBefore}T00:00:00`)}</b> in </> : <>all messages in </>}
                <b>{names(confirm.ids).slice(0, 5).join(', ')}{confirm.ids.length > 5 ? ` and ${confirm.ids.length - 5} more` : ''}</b>.
              </>
            )
          }
          confirmText={confirm.ids.length === 1 && confirm.action === 'delete' ? byId.get(confirm.ids[0])?.name : undefined}
          confirmLabel={confirm.action === 'delete' ? 'Delete conversation' : 'Delete messages'}
          onConfirm={async () => {
            if (confirm.action === 'delete') {
              await apiSend('DELETE', `/api/admin/channels/${ws.id}/${confirm.ids[0]}`);
              notice.ok('Conversation deleted');
              refresh();
            } else if (confirm.purgeBefore || confirm.ids.length === 1) {
              const res = await apiSend<{ deleted: number }>('POST', `/api/admin/channels/${ws.id}/${confirm.ids[0]}/purge`, { before: confirm.purgeBefore });
              notice.ok(`${fmtNumber(res.deleted)} messages deleted`);
              refresh();
            } else {
              await run('purge', confirm.ids);
            }
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {syncIds && ws && <SyncWithBrowser workspaceId={ws.id} channelIds={syncIds} onClose={() => setSyncIds(null)} onSent={(m) => notice.ok(m)} />}
      {notice.el}
    </div>
  );
}
