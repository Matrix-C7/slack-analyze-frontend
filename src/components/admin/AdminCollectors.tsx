'use client';

import { Ban, Globe, ListRestart, Pause, Pencil, Play, RefreshCw, Settings2, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { apiSend, fetcher } from '@/lib/api';
import { COMMAND_LABEL, type AdminCollector, type AdminCommand, type CommandType } from '@/lib/admin';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';
import { useLiveEvents } from '@/lib/live';
import { Avatar } from '../Avatar';
import { Badge, Button, Card, Confirm, Field, Modal, Td, Th, errorText, inputCls, useNotice } from './ui';

function StatusBadge({ k }: { k: AdminCollector }) {
  if (k.status === 'revoked') return <Badge tone="bad">revoked</Badge>;
  if (k.status === 'paused') return <Badge tone="warn">paused</Badge>;
  return k.online ? <Badge tone="good">online</Badge> : <Badge title={fmtDateTime(k.lastSeenAt)}>offline · {fmtRelative(k.lastSeenAt)}</Badge>;
}

const CMD_TONE = { pending: 'neutral', delivered: 'accent', done: 'good', failed: 'bad', cancelled: 'warn' } as const;

function EditCollector({ k, onClose, onSaved }: { k: AdminCollector; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(k.label ?? '');
  const [notes, setNotes] = useState(k.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Edit browser"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apiSend('PATCH', `/api/admin/collectors/${k.id}`, { label, notes });
                onSaved();
                onClose();
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="Label" hint="Overrides the label set in the extension until the extension sends a new one.">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      </Field>
      <p className="text-xs text-muted">Install id: <code>{k.id}</code></p>
      {error && <p className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}

/** Pushes capture settings to one browser's extension (applied on its next heartbeat). */
function PushSettings({ k, onClose, onSent }: { k: AdminCollector; onClose: () => void; onSent: () => void }) {
  const [s, setS] = useState({
    rangeValue: 30,
    rangeUnit: 'days' as 'days' | 'months' | 'all',
    autoEnabled: false,
    autoIntervalMinutes: 60,
    incremental: true,
    liveCapture: true,
    keepSlackActive: true,
    keepSlackActiveMinutes: 5,
    captureThreads: true,
    verifyPass: true,
    loadPatienceSec: 60,
    scrollDelayMs: 1200,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof s>(key: K, v: (typeof s)[K]) => setS({ ...s, [key]: v });
  const toggle = (key: 'autoEnabled' | 'incremental' | 'liveCapture' | 'keepSlackActive' | 'captureThreads' | 'verifyPass', label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={s[key]} onChange={(e) => set(key, e.target.checked)} /> {label}
    </label>
  );
  return (
    <Modal
      wide
      title={`Capture settings · ${k.label || k.browser || 'browser'}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apiSend('POST', `/api/admin/collectors/${k.id}/commands`, { type: 'set_settings', payload: s });
                onSent();
                onClose();
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            Send to browser
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">Replaces these settings in the extension the next time it checks in (within about a minute).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="History range">
          <div className="flex gap-2">
            <input type="number" min={1} max={1200} disabled={s.rangeUnit === 'all'} value={s.rangeValue} onChange={(e) => set('rangeValue', Number(e.target.value) || 1)} className={inputCls} />
            <select value={s.rangeUnit} onChange={(e) => set('rangeUnit', e.target.value as typeof s.rangeUnit)} className={inputCls}>
              <option value="days">days</option>
              <option value="months">months</option>
              <option value="all">all history</option>
            </select>
          </div>
        </Field>
        <Field label="Auto-sync interval">
          <select value={s.autoIntervalMinutes} onChange={(e) => set('autoIntervalMinutes', Number(e.target.value))} className={inputCls}>
            {[15, 30, 60, 180, 360, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Keep Slack tab active — check every" hint="Selects the Slack tab again when another tab is selected in its window">
          <select disabled={!s.keepSlackActive} value={s.keepSlackActiveMinutes} onChange={(e) => set('keepSlackActiveMinutes', Number(e.target.value))} className={inputCls}>
            {[1, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </Field>
        <Field label="Load patience (s)" hint="How long to wait for Slack to load older history">
          <input type="number" min={10} max={600} value={s.loadPatienceSec} onChange={(e) => set('loadPatienceSec', Number(e.target.value) || 60)} className={inputCls} />
        </Field>
        <Field label="Scroll delay (ms)">
          <input type="number" min={300} max={10000} step={100} value={s.scrollDelayMs} onChange={(e) => set('scrollDelayMs', Number(e.target.value) || 1200)} className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {toggle('autoEnabled', 'Auto-sync selected conversations')}
        {toggle('incremental', 'Incremental auto-sync')}
        {toggle('liveCapture', 'Live capture')}
        {toggle('keepSlackActive', 'Keep Slack tab active')}
        {toggle('captureThreads', 'Capture thread replies')}
        {toggle('verifyPass', 'Verification pass')}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}

export function AdminCollectors() {
  const { data: collectors, mutate } = useSWR<AdminCollector[]>('/api/admin/collectors', fetcher, { refreshInterval: 20_000 });
  const { data: commands, mutate: refreshCommands } = useSWR<AdminCommand[]>('/api/admin/commands?limit=50', fetcher, { refreshInterval: 10_000 });
  const notice = useNotice();
  const [editing, setEditing] = useState<AdminCollector | null>(null);
  const [settingsFor, setSettingsFor] = useState<AdminCollector | null>(null);
  const [confirm, setConfirm] = useState<{ k: AdminCollector; action: 'revoke' | 'delete' } | null>(null);
  useLiveEvents((e) => {
    if (e.type === 'notification') return; // always follows a 'messages' event
    mutate();
    refreshCommands();
  });

  const refresh = () => {
    mutate();
    refreshCommands();
  };
  const send = async (k: AdminCollector, type: CommandType) => {
    try {
      await apiSend('POST', `/api/admin/collectors/${k.id}/commands`, { type, payload: {} });
      notice.ok(`${COMMAND_LABEL[type]} queued for ${k.label || k.browser}`);
      refresh();
    } catch (e) {
      notice.fail(e);
    }
  };
  const setStatus = async (k: AdminCollector, status: 'active' | 'paused') => {
    try {
      await apiSend('PATCH', `/api/admin/collectors/${k.id}`, { status });
      notice.ok(status === 'paused' ? 'Capture paused' : 'Capture resumed');
      refresh();
    } catch (e) {
      notice.fail(e);
    }
  };

  return (
    <div className="space-y-4">
      <Card title={`Browsers${collectors ? ` · ${collectors.length}` : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-subtle">
              <tr>
                <Th>Browser</Th>
                <Th>Slack account</Th>
                <Th>Status</Th>
                <Th>Version</Th>
                <Th className="text-right">Runs</Th>
                <Th className="text-right">Messages</Th>
                <Th>Last run</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {collectors?.map((k) => {
                const revoked = k.status === 'revoked';
                return (
                  <tr key={k.id} className={`border-t border-line ${revoked ? 'opacity-60' : ''}`}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Globe size={16} className="flex-none text-muted" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{k.label || k.browser || 'Browser'}</div>
                          <div className="truncate text-xs text-muted" title={k.id}>
                            {k.browser} · {k.id.slice(0, 8)}
                            {k.notes ? ` · ${k.notes}` : ''}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {k.accountId ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={k.accountName ?? k.accountId} url={k.accountAvatar} size={22} />
                          <div className="min-w-0">
                            <div className="truncate">{k.accountName ?? k.accountId}</div>
                            <div className="truncate text-xs text-muted">{k.workspaceName ?? k.workspaceId}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge k={k} />
                        {k.failed24h > 0 && <Badge tone="bad">{k.failed24h} failed 24h</Badge>}
                        {k.openCommands > 0 && <Badge tone="accent">{k.openCommands} queued</Badge>}
                      </div>
                    </Td>
                    <Td className="text-muted">{k.version ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{fmtNumber(k.runCount)}</Td>
                    <Td className="text-right tabular-nums">{fmtNumber(k.messagesReceived)}</Td>
                    <Td title={fmtDateTime(k.lastRunAt)}>{fmtRelative(k.lastRunAt)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-0.5">
                        {!revoked && (
                          <>
                            <Button variant="ghost" title="Sync the conversation open in Slack" onClick={() => send(k, 'sync_open')} disabled={k.status === 'paused'}>
                              <RefreshCw size={14} />
                            </Button>
                            <Button variant="ghost" title="Refresh conversation list from the Slack sidebar" onClick={() => send(k, 'refresh_channels')} disabled={k.status === 'paused'}>
                              <ListRestart size={14} />
                            </Button>
                            <Button variant="ghost" title="Stop the running sync" onClick={() => send(k, 'stop')}>
                              <Square size={14} />
                            </Button>
                            <Button variant="ghost" title="Push capture settings" onClick={() => setSettingsFor(k)}>
                              <Settings2 size={14} />
                            </Button>
                            {k.status === 'paused' ? (
                              <Button variant="ghost" title="Resume capture" onClick={() => setStatus(k, 'active')} className="text-good">
                                <Play size={14} />
                              </Button>
                            ) : (
                              <Button variant="ghost" title="Pause capture" onClick={() => setStatus(k, 'paused')} className="text-warn">
                                <Pause size={14} />
                              </Button>
                            )}
                            <Button variant="ghost" title="Revoke: refuse all uploads from this browser" onClick={() => setConfirm({ k, action: 'revoke' })} className="text-bad">
                              <Ban size={14} />
                            </Button>
                          </>
                        )}
                        {revoked && (
                          <Button variant="ghost" title="Restore" onClick={() => setStatus(k, 'active')}>
                            <Play size={14} /> Restore
                          </Button>
                        )}
                        <Button variant="ghost" title="Edit label / notes" onClick={() => setEditing(k)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" title="Forget this browser" onClick={() => setConfirm({ k, action: 'delete' })} className="text-bad">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {collectors?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    No browsers yet. Install the extension, set the backend URL and API key, and click Test connection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Command history">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-subtle">
              <tr>
                <Th>Command</Th>
                <Th>Browser</Th>
                <Th>Status</Th>
                <Th>Result</Th>
                <Th>By</Th>
                <Th>Queued</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {commands?.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <Td className="font-semibold">
                    {COMMAND_LABEL[c.type]}
                    {c.type === 'sync_channels' && Array.isArray(c.payload.channelIds) && (
                      <span className="font-normal text-muted"> · {(c.payload.channelIds as string[]).length}</span>
                    )}
                  </Td>
                  <Td>{c.collector ?? c.collectorId.slice(0, 8)}</Td>
                  <Td>
                    <Badge tone={CMD_TONE[c.status]}>{c.status}</Badge>
                  </Td>
                  <Td className="max-w-xs truncate text-muted" title={c.result ?? undefined}>
                    {c.result ?? '—'}
                  </Td>
                  <Td className="text-muted">{c.createdBy ?? '—'}</Td>
                  <Td title={fmtDateTime(c.createdAt)}>{fmtRelative(c.createdAt)}</Td>
                  <Td className="text-right">
                    {c.status === 'pending' && (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await apiSend('POST', `/api/admin/commands/${c.id}/cancel`);
                            refresh();
                          } catch (e) {
                            notice.fail(e);
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {commands?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted">
                    No commands sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <EditCollector k={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {settingsFor && <PushSettings k={settingsFor} onClose={() => setSettingsFor(null)} onSent={() => (notice.ok('Settings queued'), refresh())} />}
      {confirm && (
        <Confirm
          title={confirm.action === 'revoke' ? 'Revoke browser' : 'Forget browser'}
          body={
            confirm.action === 'revoke' ? (
              <>
                <b>{confirm.k.label || confirm.k.browser}</b> will be refused on every upload until restored. Captured data is kept.
              </>
            ) : (
              <>
                Remove <b>{confirm.k.label || confirm.k.browser}</b> from the list? Captured data is kept. If the extension is still installed it
                will re-appear the next time it checks in — revoke it instead to block it.
              </>
            )
          }
          confirmLabel={confirm.action === 'revoke' ? 'Revoke' : 'Forget'}
          onConfirm={async () => {
            if (confirm.action === 'revoke') await apiSend('PATCH', `/api/admin/collectors/${confirm.k.id}`, { status: 'revoked' });
            else await apiSend('DELETE', `/api/admin/collectors/${confirm.k.id}`);
            refresh();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {notice.el}
    </div>
  );
}
