'use client';

import { AlertTriangle, Globe, HardDrive, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { apiSend, fetcher } from '@/lib/api';
import { fmtBytes, type AdminCollector, type AdminFiles, type AdminOverview as Overview } from '@/lib/admin';
import { fmtCompact, fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';
import { useLiveEvents } from '@/lib/live';
import { Badge, Button, Card, Stat, useNotice } from './ui';

/** Messages stored per hour over the last 48 h. */
function IngestBars({ hourly }: { hourly: Overview['hourly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...hourly.map((h) => h.messages));
  const h = hover !== null ? hourly[hover] : null;
  const label = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' });
  return (
    <div className="p-4">
      <div className="mb-2 flex justify-between text-xs text-muted">
        <span>Messages stored per hour · last 48 h</span>
        <span className="tabular-nums">{h ? `${label(h.hour)}: ${fmtNumber(h.messages)}` : `peak ${fmtNumber(max)}/h`}</span>
      </div>
      <div className="flex h-28 items-end gap-[2px]" onMouseLeave={() => setHover(null)} role="img" aria-label="Hourly ingest volume, last 48 hours">
        {hourly.map((x, i) => (
          <div key={x.hour} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: x.messages ? `${Math.max(3, (x.messages / max) * 100)}%` : '2px',
                background: x.messages ? 'var(--series-1)' : 'var(--grid)',
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{hourly[0] && label(hourly[0].hour)}</span>
        <span>now</span>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { image: 'Images', video: 'Videos', pdf: 'PDFs', doc: 'Documents', other: 'Other' };

/** Files downloaded from Slack by the browsers: storage use, download queue and failures. */
function FileArchive() {
  const { data, mutate } = useSWR<AdminFiles>('/api/admin/files', fetcher, { refreshInterval: 30_000 });
  const notice = useNotice();
  const [busy, setBusy] = useState<'failed' | 'skipped' | null>(null);
  if (!data) return null;
  const c = data.counts;
  const total = c.stored + c.pending + c.failed + c.skipped;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');

  const retry = async (status: 'failed' | 'skipped') => {
    setBusy(status);
    try {
      const res = await apiSend<{ queued: number }>('POST', '/api/admin/files/retry', { status });
      notice.ok(res.queued ? `${res.queued} file(s) queued — browsers download them within a minute` : 'Nothing to retry');
      mutate();
    } catch (e) {
      notice.fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title={<span className="flex items-center gap-2"><HardDrive size={16} className="text-accent" /> File archive</span>}
      actions={
        <span className="flex items-center gap-2">
          <Badge tone="accent" title={`Up to ${fmtBytes(data.maxBytes)} per file`}>{data.storage === 's3' ? 'S3 storage' : 'Local disk'}</Badge>
          {c.failed > 0 && (
            <Button onClick={() => retry('failed')} busy={busy === 'failed'}>
              <RotateCcw size={14} /> Retry failed
            </Button>
          )}
          {c.skipped > 0 && (
            <Button variant="ghost" onClick={() => retry('skipped')} busy={busy === 'skipped'} title="Files over the size limit or of a type that was turned off">
              Retry skipped
            </Button>
          )}
        </span>
      }
    >
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums">{fmtBytes(data.bytes)}</span>
            <span className="text-sm text-muted">in {fmtNumber(data.blobs)} stored file(s)</span>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label="Files by archive status">
            <div style={{ width: pct(c.stored), background: 'var(--good)' }} />
            <div style={{ width: pct(c.pending), background: 'var(--series-1)' }} />
            <div style={{ width: pct(c.failed), background: 'var(--bad)' }} />
            <div style={{ width: pct(c.skipped), background: 'var(--grid)' }} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {([
              ['Archived', c.stored, 'var(--good)'],
              ['Waiting for a browser', c.pending, 'var(--series-1)'],
              ['Failed', c.failed, 'var(--bad)'],
              ['Skipped', c.skipped, 'var(--grid)'],
            ] as const).map(([label, n, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
                <dt className="flex-1 text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{fmtNumber(n)}</dd>
              </div>
            ))}
          </dl>
          {data.byKind.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.byKind.map((k) => (
                <Badge key={k.kind} title={`${fmtNumber(k.files)} file(s)`}>
                  {KIND_LABEL[k.kind] ?? k.kind} · {fmtBytes(k.bytes)}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Recent download failures</div>
          {data.recentFailures.length === 0 ? (
            <p className="py-4 text-sm text-muted">No failed downloads.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.recentFailures.slice(0, 6).map((f) => (
                <li key={f.id} className="flex items-baseline gap-2 py-1.5">
                  <Link href={`/c/${f.workspaceId}/${f.channelId}?ts=${f.ts}`} className="max-w-[40%] truncate font-semibold hover:underline" title={f.name ?? undefined}>
                    {f.name || 'file'}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-bad" title={f.error ?? undefined}>{f.error ?? 'failed'}</span>
                  <span className="flex-none text-xs text-muted" title={fmtDateTime(f.sentAt)}>{f.channelName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {notice.el}
    </Card>
  );
}

export function AdminOverview() {
  const { data, mutate } = useSWR<Overview>('/api/admin/overview', fetcher, { refreshInterval: 30_000 });
  const { data: collectors } = useSWR<AdminCollector[]>('/api/admin/collectors', fetcher, { refreshInterval: 30_000 });
  useLiveEvents((e) => e.type !== 'notification' && mutate());

  if (!data) return <p className="p-6 text-muted">Loading…</p>;
  const t = data.totals;
  const r = data.runs24h;
  const runsTotal = r.completed + r.failed + r.cancelled + r.running;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Messages" value={fmtCompact(t.messages)} sub={`${fmtNumber(t.threadReplies)} thread replies`} />
        <Stat label="Stored last 24 h" value={fmtCompact(t.messages24h)} sub={`last ${fmtRelative(t.lastIngestAt)}`} />
        <Stat
          label="Browsers online"
          value={`${t.collectorsOnline} / ${t.collectors}`}
          sub={t.collectorsPaused ? `${t.collectorsPaused} paused` : `${t.accounts} Slack accounts`}
          tone={t.collectors > 0 && t.collectorsOnline === 0 ? 'warn' : undefined}
        />
        <Stat
          label="Sync runs 24 h"
          value={fmtNumber(runsTotal)}
          sub={`${r.completed} ok · ${r.failed} failed · ${r.running} running`}
          tone={r.failed > 0 ? 'bad' : undefined}
        />
        <Stat label="Conversations" value={fmtNumber(t.channels)} sub={`${t.hiddenChannels} hidden · ${t.excludedChannels} excluded`} />
        <Stat label="Database" value={fmtBytes(data.databaseBytes)} sub={`${t.workspaces} workspace(s) · ${t.appUsers} users`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Ingest activity" className="xl:col-span-2">
          <IngestBars hourly={data.hourly} />
        </Card>

        <Card title="Browsers" actions={<Link href="/admin?tab=collectors" className="text-sm font-semibold text-accent hover:underline">Manage</Link>}>
          <ul className="divide-y divide-line">
            {(collectors ?? []).slice(0, 6).map((k) => (
              <li key={k.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <Globe size={14} className="flex-none text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{k.label || k.browser || 'Browser'}</div>
                  <div className="truncate text-xs text-muted">{k.accountName ?? k.accountId ?? 'No Slack account yet'}</div>
                </div>
                {k.status !== 'active' ? (
                  <Badge tone={k.status === 'paused' ? 'warn' : 'bad'}>{k.status}</Badge>
                ) : k.online ? (
                  <Badge tone="good">online</Badge>
                ) : (
                  <Badge title={fmtDateTime(k.lastSeenAt)}>{fmtRelative(k.lastSeenAt)}</Badge>
                )}
              </li>
            ))}
            {collectors?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No browsers have connected yet.</li>}
          </ul>
        </Card>
      </div>

      <FileArchive />

      <Card title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-bad" /> Recent failed runs</span>}>
        {data.recentFailures.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No failed sync runs.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.recentFailures.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                <span className="font-semibold">{f.channelName ?? f.channelId ?? '—'}</span>
                <span className="text-xs text-muted">{f.collector ?? 'unknown browser'}</span>
                <span className="min-w-0 flex-1 truncate text-bad" title={f.error ?? undefined}>{f.error ?? 'failed'}</span>
                <span className="text-xs text-muted" title={fmtDateTime(f.startedAt)}>{fmtRelative(f.startedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
