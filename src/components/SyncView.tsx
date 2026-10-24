'use client';

import { AlertTriangle, CheckCircle2, CircleSlash, Globe, Loader2 } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher, qs, type Channel, type SyncRun } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';
import { useLiveEvents } from '@/lib/live';
import { useWorkspace } from '@/lib/workspace';
import { Avatar } from './Avatar';
import { ChannelIcon } from './ChannelSidebar';
import { PageHeader } from './PageHeader';

// Status is never color-only: each badge has an icon and a label.
const STATUS = {
  running: { icon: Loader2, label: 'Running', cls: 'text-accent', spin: true },
  completed: { icon: CheckCircle2, label: 'Completed', cls: 'text-good', spin: false },
  failed: { icon: AlertTriangle, label: 'Failed', cls: 'text-bad', spin: false },
  cancelled: { icon: CircleSlash, label: 'Cancelled', cls: 'text-warn', spin: false },
} as const;

function OnlineBadge({ online, lastSeenAt }: { online: boolean; lastSeenAt: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${online ? 'text-good' : 'text-muted'}`} title={fmtDateTime(lastSeenAt)}>
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-good' : 'bg-line'}`} />
      {online ? 'Online' : `Seen ${fmtRelative(lastSeenAt)}`}
    </span>
  );
}

/** One card per Slack account, listing the browsers (extension installs) capturing as that account. */
function AccountsPanel() {
  const { accounts, account, setAccountId } = useWorkspace();
  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-line p-4 text-sm text-muted">
        No accounts yet. Install the extension in each browser signed in to Slack, then run a sync or click <b>Test connection</b>.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((a) => {
        const selected = account?.id === a.id;
        return (
          <div key={a.id} className={`rounded-xl border p-3 ${selected ? 'border-accent' : 'border-line'}`}>
            <div className="flex items-center gap-2.5">
              <Avatar name={a.name ?? a.id} url={a.avatarUrl} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{a.name ?? a.id}</div>
                <div className="truncate text-xs text-muted">{a.id}</div>
              </div>
              <OnlineBadge online={a.online} lastSeenAt={a.lastSeenAt} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <dt className="text-muted">Conversations</dt>
                <dd className="text-base font-bold tabular-nums">{fmtNumber(a.channelCount)}</dd>
              </div>
              <div>
                <dt className="text-muted">Captured</dt>
                <dd className="text-base font-bold tabular-nums">{fmtNumber(a.capturedChannelCount)}</dd>
              </div>
              <div>
                <dt className="text-muted" title="Messages this account delivered first">Messages</dt>
                <dd className="text-base font-bold tabular-nums">{fmtNumber(a.messagesFirstCaptured)}</dd>
              </div>
            </dl>
            <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
              {a.collectors.map((k) => (
                <li key={k.id} className="flex items-center gap-2">
                  <Globe size={12} className="flex-none text-muted" />
                  <span className="min-w-0 flex-1 truncate" title={`Install ${k.id} · v${k.version ?? '?'}`}>
                    {k.label || k.browser || 'Browser'}
                    {k.label && k.browser && <span className="text-muted"> · {k.browser}</span>}
                  </span>
                  <OnlineBadge online={k.online} lastSeenAt={k.lastSeenAt} />
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>Last sync {fmtRelative(a.lastSyncedAt)}</span>
              <button onClick={() => setAccountId(selected ? null : a.id)} className="font-semibold text-accent hover:underline">
                {selected ? 'Show all accounts' : 'View as this account'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SyncView() {
  const { workspace, account } = useWorkspace();
  const { data: runs, mutate: refreshRuns } = useSWR<SyncRun[]>(
    `/api/sync-runs${qs({ limit: 100, workspaceId: workspace?.id, accountId: account?.id })}`,
    fetcher,
    { refreshInterval: 15_000 },
  );
  const { data: channels, mutate: refreshChannels } = useSWR<Channel[]>(
    workspace ? `/api/channels${qs({ workspaceId: workspace.id, accountId: account?.id })}` : null,
    fetcher,
  );

  useLiveEvents((e) => {
    if (e.type === 'notification') return; // always follows a 'messages' event
    refreshRuns();
    refreshChannels();
  });

  const captured = (channels ?? []).filter((c) => c.messageCount > 0);
  const notCaptured = (channels ?? []).filter((c) => c.messageCount === 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Sync status" subtitle="Accounts, browsers, capture runs and coverage per conversation" />
      <div className="scroll-slim flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
        <section>
          <h2 className="mb-2 font-bold">Accounts &amp; browsers</h2>
          <AccountsPanel />
        </section>

        <section>
          <h2 className="mb-2 font-bold">Recent runs</h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Conversation</th>
                  <th className="px-3 py-2 font-semibold">Account · browser</th>
                  <th className="px-3 py-2 font-semibold">Trigger</th>
                  <th className="px-3 py-2 text-right font-semibold">Messages</th>
                  <th className="px-3 py-2 font-semibold">Range from</th>
                  <th className="px-3 py-2 font-semibold">Oldest reached</th>
                  <th className="px-3 py-2 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs?.map((r) => {
                  const s = STATUS[r.status];
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="px-3 py-2">
                        <span className={`flex items-center gap-1.5 font-semibold ${s.cls}`} title={r.error ?? undefined}>
                          <s.icon size={14} className={s.spin ? 'animate-spin' : ''} /> {s.label}
                        </span>
                        {r.error && <div className="mt-0.5 max-w-xs truncate text-xs text-muted">{r.error}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {r.channelId ? (
                          <Link href={`/c/${r.workspaceId}/${r.channelId}`} className="hover:underline">
                            {r.channelName ?? r.channelId}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div>{r.accountName ?? r.accountId ?? '—'}</div>
                        {(r.collectorLabel || r.browser) && <div className="text-xs text-muted">{r.collectorLabel || r.browser}</div>}
                      </td>
                      <td className="px-3 py-2 capitalize">{r.trigger}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(r.messagesReceived)}</td>
                      <td className="px-3 py-2">{r.rangeFrom ? fmtDate(r.rangeFrom) : 'All history'}</td>
                      <td className="px-3 py-2">{fmtDate(r.oldestSeenAt)}</td>
                      <td className="px-3 py-2" title={fmtDateTime(r.startedAt)}>
                        {fmtRelative(r.startedAt)}
                      </td>
                    </tr>
                  );
                })}
                {runs?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted">
                      No sync runs yet. Start one from the extension popup.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-bold">
            Coverage <span className="font-normal text-muted">· {captured.length} of {channels?.length ?? 0} conversations captured</span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-subtle text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Conversation</th>
                  <th className="px-3 py-2 text-right font-semibold">Messages</th>
                  <th className="px-3 py-2 font-semibold">Oldest message</th>
                  <th className="px-3 py-2 font-semibold">Newest message</th>
                  <th className="px-3 py-2 font-semibold">History</th>
                  <th className="px-3 py-2 font-semibold">Accounts</th>
                  <th className="px-3 py-2 font-semibold">Last synced</th>
                </tr>
              </thead>
              <tbody>
                {[...captured, ...notCaptured].map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <Link href={`/c/${workspace!.id}/${c.id}`} className="flex items-center gap-1.5 hover:underline">
                        <ChannelIcon type={c.type} size={13} /> {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(c.messageCount)}</td>
                    <td className="px-3 py-2">{fmtDate(c.firstMessageAt)}</td>
                    <td className="px-3 py-2">{fmtDate(c.lastMessageAt)}</td>
                    <td className="px-3 py-2">
                      {c.reachedStart ? (
                        <span className="flex items-center gap-1 text-good">
                          <CheckCircle2 size={13} /> Complete
                        </span>
                      ) : c.messageCount ? (
                        <span className="text-muted">Partial</span>
                      ) : (
                        <span className="text-muted">Not captured</span>
                      )}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2" title={c.accounts.map((a) => a.name).join(', ')}>
                      {c.accounts.length ? c.accounts.map((a) => a.name).join(', ') : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2">{fmtRelative(c.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
