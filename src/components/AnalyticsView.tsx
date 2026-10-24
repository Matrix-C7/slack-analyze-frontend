'use client';

import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Loader2, Minus, Table2, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useSWR from 'swr';
import { fetcher, qs, type Analytics, type Channel } from '@/lib/api';
import { emoji, fmtCompact, fmtDate, fmtNumber, typeLabel } from '@/lib/format';
import { useLiveEvents } from '@/lib/live';
import { useWorkspace } from '@/lib/workspace';
import { Avatar } from './Avatar';
import { ChannelIcon } from './ChannelSidebar';
import { PageHeader } from './PageHeader';

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '12M', days: 365 },
];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
};

function Card({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-line bg-bg p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <span className="text-xs text-muted">no prior data</span>;
  const pct = ((now - prev) / prev) * 100;
  const Icon = Math.abs(pct) < 0.5 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-0.5 text-xs text-muted">
      <Icon size={13} />
      <span className="font-semibold text-ink">{`${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`}</span> vs previous period
    </span>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-[28px] font-black leading-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function DailyChart({ data, showTable }: { data: Analytics['daily']; showTable: boolean }) {
  if (showTable) {
    return (
      <div className="scroll-slim max-h-[260px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 text-right font-semibold">Messages</th>
              <th className="py-1 text-right font-semibold">People</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{fmtDate(`${d.day}T00:00:00`, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="py-1 text-right tabular-nums">{fmtNumber(d.messages)}</td>
                <td className="py-1 text-right tabular-nums">{fmtNumber(d.users)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            minTickGap={28}
            tickFormatter={(d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={fmtCompact} width={44} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as Analytics['daily'][number];
              return (
                <div className="rounded-lg border border-line bg-bg px-3 py-2 text-sm shadow-lg">
                  <div className="mb-1 font-bold">{fmtDate(`${d.day}T00:00:00`, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--series-1)' }} />
                    <span className="text-muted">Messages</span>
                    <span className="ml-auto font-bold tabular-nums">{fmtNumber(d.messages)}</span>
                  </div>
                  <div className="text-muted">
                    {fmtNumber(d.users)} {d.users === 1 ? 'person' : 'people'} active
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="messages"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#dailyFill)"
            activeDot={{ r: 5, stroke: 'var(--bg)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Heatmap({ cells }: { cells: Analytics['heatmap'] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; v: number } | null>(null);
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const c of cells) g[c.dow - 1][c.hour] = c.messages;
    return g;
  }, [cells]);
  const max = Math.max(1, ...cells.map((c) => c.messages));
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });

  return (
    <div>
      <div className="mb-2 h-5 text-sm text-muted">
        {hover ? (
          <>
            <b className="text-ink">
              {DOW[hover.dow]} {hourLabel(hover.hour)}
            </b>
            : {fmtNumber(hover.v)} messages
          </>
        ) : (
          'Hover a cell for details'
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] gap-[2px]" style={{ gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))' }} onMouseLeave={() => setHover(null)}>
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <div className="pr-1 text-right text-[11px] leading-[18px] text-muted">{DOW[d]}</div>
              {row.map((v, h) => (
                <div
                  key={h}
                  onMouseEnter={() => setHover({ dow: d, hour: h, v })}
                  className={clsx('h-[18px] rounded-[3px]', hover?.dow === d && hover.hour === h && 'ring-2 ring-ink')}
                  style={{
                    background: v
                      ? `color-mix(in srgb, var(--series-1) ${Math.round(12 + (v / max) * 88)}%, var(--bg-subtle))`
                      : 'var(--bg-subtle)',
                  }}
                />
              ))}
            </div>
          ))}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[10px] text-muted">
              {h % 3 === 0 ? hourLabel(h).replace(/\s/g, '') : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-muted">
        <span>Fewer</span>
        <div className="h-2 w-24 rounded" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--series-1) 12%, var(--bg-subtle)), var(--series-1))' }} />
        <span>More</span>
      </div>
    </div>
  );
}

function BarList<T>({
  rows,
  value,
  label,
  sub,
  href,
}: {
  rows: T[];
  value: (r: T) => number;
  label: (r: T) => React.ReactNode;
  sub?: (r: T) => string;
  href?: (r: T) => string;
}) {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <p className="text-sm text-muted">No data in this range.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => {
        const inner = (
          <div className="group relative flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover" title={sub?.(r)}>
            <div className="absolute inset-y-1 left-1 rounded-[4px] opacity-20 transition group-hover:opacity-30" style={{ width: `calc(${(value(r) / max) * 100}% - 8px)`, background: 'var(--series-1)' }} />
            <div className="relative flex min-w-0 flex-1 items-center gap-2 text-sm">{label(r)}</div>
            <div className="relative text-sm font-bold tabular-nums">{fmtNumber(value(r))}</div>
          </div>
        );
        return <li key={i}>{href ? <Link href={href(r)}>{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

export function AnalyticsView() {
  const { workspace, account } = useWorkspace();
  const [preset, setPreset] = useState<number | null>(30);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));
  const [channelId, setChannelId] = useState('');
  const [table, setTable] = useState(false);
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  const accountId = account?.id;
  const key = workspace
    ? `/api/analytics/overview${qs({ workspaceId: workspace.id, accountId, from, to, tz, channelIds: channelId })}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<Analytics>(key, fetcher, { keepPreviousData: true });
  const { data: channels } = useSWR<Channel[]>(workspace ? `/api/channels${qs({ workspaceId: workspace.id, accountId })}` : null, fetcher);

  useLiveEvents((e) => {
    if (e.type === 'messages' && e.data.workspaceId === workspace?.id) mutate();
  });

  const applyPreset = (days: number) => {
    setPreset(days);
    setFrom(daysAgo(days - 1));
    setTo(daysAgo(0));
  };

  const k = data?.kpis;
  const busiest = useMemo(() => {
    if (!data?.heatmap.length) return null;
    return data.heatmap.reduce((a, b) => (b.messages > a.messages ? b : a));
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Analytics"
        subtitle={data ? `${fmtDate(`${data.range.from}T00:00:00`)} – ${fmtDate(`${data.range.to}T00:00:00`)} · ${data.range.tz}` : workspace?.name}
      >
        {isLoading && <Loader2 size={16} className="animate-spin text-muted" />}
      </PageHeader>

      {/* Filters: one row above the charts */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-sm md:px-6">
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => applyPreset(p.days)}
              className={clsx('px-3 py-1 font-semibold', preset === p.days ? 'bg-ink text-bg' : 'hover:bg-hover')}
              aria-pressed={preset === p.days}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input type="date" value={from} max={to} onChange={(e) => (setPreset(null), setFrom(e.target.value))} className="rounded-md border border-line bg-bg px-2 py-1" aria-label="From" />
        <span className="text-muted">→</span>
        <input type="date" value={to} min={from} onChange={(e) => (setPreset(null), setTo(e.target.value))} className="rounded-md border border-line bg-bg px-2 py-1" aria-label="To" />
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="max-w-[220px] rounded-md border border-line bg-bg px-2 py-1" aria-label="Conversation">
          <option value="">All conversations</option>
          {channels
            ?.filter((c) => c.messageCount > 0)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.type === 'dm' || c.type === 'group_dm' ? '@' : '#'}
                {c.name}
              </option>
            ))}
        </select>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto bg-subtle p-4 md:p-6">
        {error && <p className="text-bad">Could not load analytics: {String((error as Error).message)}</p>}
        {!workspace && <p className="text-muted">No workspace captured yet.</p>}
        {k && data && (
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Messages" value={fmtNumber(k.messages)} sub={<Delta now={k.messages} prev={k.previousMessages} />} />
              <Kpi label="Active people" value={fmtNumber(k.activeUsers)} sub={<Delta now={k.activeUsers} prev={k.previousActiveUsers} />} />
              <Kpi label="Avg / day" value={k.avgPerDay.toFixed(k.avgPerDay < 10 ? 1 : 0)} sub={<span className="text-xs text-muted">{fmtNumber(k.activeChannels)} active conversations</span>} />
              <Kpi
                label="Engagement"
                value={fmtNumber(k.reactions)}
                sub={
                  <span className="text-xs text-muted">
                    reactions · {fmtNumber(k.threads)} threads · {fmtNumber(k.messagesWithFiles)} with files
                  </span>
                }
              />
            </div>

            <Card
              title="Messages per day"
              action={
                <button onClick={() => setTable(!table)} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-hover">
                  {table ? <TrendingUp size={13} /> : <Table2 size={13} />} {table ? 'Chart' : 'Table'}
                </button>
              }
            >
              <DailyChart data={data.daily} showTable={table} />
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Most active conversations">
                <BarList
                  rows={data.topChannels}
                  value={(r) => r.messages}
                  sub={(r) => `${r.users} people`}
                  href={(r) => `/c/${r.workspaceId}/${r.id}`}
                  label={(r) => (
                    <>
                      <span className="flex-none text-muted">
                        <ChannelIcon type={r.type} size={14} />
                      </span>
                      <span className="truncate">{r.name}</span>
                    </>
                  )}
                />
              </Card>
              <Card title="Most active people">
                <BarList
                  rows={data.topUsers}
                  value={(r) => r.messages}
                  sub={(r) => `${r.channels} conversations`}
                  href={(r) => `/search${qs({ userIds: r.id, from, to })}`}
                  label={(r) => (
                    <>
                      <Avatar name={r.name} size={20} />
                      <span className="truncate">{r.name ?? r.id}</span>
                      <span className="text-xs text-muted">in {r.channels}</span>
                    </>
                  )}
                />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card
                title="When people talk"
                className="lg:col-span-2"
                action={
                  busiest && (
                    <span className="text-xs text-muted">
                      Peak: {DOW[busiest.dow - 1]} {new Date(2000, 0, 1, busiest.hour).toLocaleTimeString([], { hour: 'numeric' })}
                    </span>
                  )
                }
              >
                <Heatmap cells={data.heatmap} />
              </Card>
              <div className="space-y-4">
                <Card title="Top reactions">
                  {data.topReactions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {data.topReactions.map((r) => (
                        <span key={r.emoji} title={`:${r.emoji}:`} className="flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-sm">
                          <span>{emoji(r.emoji)}</span>
                          <span className="font-bold tabular-nums">{fmtNumber(r.count)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No reactions in this range.</p>
                  )}
                </Card>
                <Card title="By conversation type">
                  <BarList rows={data.byType} value={(r) => r.messages} label={(r) => <span>{typeLabel(r.type)}</span>} />
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
