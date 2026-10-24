'use client';

import { useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { fetcher, qs } from '@/lib/api';
import type { AuditEntry } from '@/lib/admin';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { Badge, Button, Card, Td, Th, inputCls } from './ui';

const PAGE = 100;
const GROUPS = [
  { id: '', label: 'All actions' },
  { id: 'auth.', label: 'Sign-ins & passwords' },
  { id: 'user.', label: 'Users' },
  { id: 'collector.', label: 'Browsers' },
  { id: 'command.', label: 'Commands' },
  { id: 'channel.', label: 'Conversations' },
  { id: 'message.', label: 'Messages' },
  { id: 'workspace.', label: 'Workspaces' },
  { id: 'content.', label: 'Exports' },
];

const tone = (action: string) =>
  /delete|purge|revoke/.test(action) ? 'bad' : /pause|exclude|hide/.test(action) ? 'warn' : action.startsWith('auth.') ? 'neutral' : 'accent';

function detailText(d: AuditEntry['details']) {
  if (!d) return '';
  return Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length > 4 ? `${v.slice(0, 4).join(', ')} +${v.length - 4}` : v.join(', ')) : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function AdminAudit() {
  const [action, setAction] = useState('');
  const { data, size, setSize, isValidating } = useSWRInfinite<AuditEntry[]>(
    (i, prev: AuditEntry[] | null) => {
      if (prev && prev.length < PAGE) return null;
      return `/api/admin/audit${qs({ limit: PAGE, action, before: prev?.at(-1)?.id })}`;
    },
    fetcher,
  );
  const rows = data?.flat() ?? [];
  const more = data?.at(-1)?.length === PAGE;

  return (
    <Card
      title="Audit log"
      actions={
        <select value={action} onChange={(e) => setAction(e.target.value)} className={`${inputCls} w-auto`} aria-label="Filter actions">
          {GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-subtle">
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <Td className="whitespace-nowrap" title={fmtDateTime(r.createdAt)}>
                  {fmtRelative(r.createdAt)}
                </Td>
                <Td>{r.userEmail ?? <span className="text-muted">system</span>}</Td>
                <Td>
                  <Badge tone={tone(r.action)}>{r.action}</Badge>
                </Td>
                <Td className="max-w-[200px] truncate font-mono text-xs" title={r.target ?? undefined}>
                  {r.target ?? '—'}
                </Td>
                <Td className="max-w-md break-words text-xs text-muted">{detailText(r.details)}</Td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {more && (
        <div className="flex justify-center border-t border-line p-3">
          <Button busy={isValidating} onClick={() => setSize(size + 1)}>
            Load older
          </Button>
        </div>
      )}
    </Card>
  );
}
