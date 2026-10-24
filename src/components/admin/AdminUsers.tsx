'use client';

import clsx from 'clsx';
import { EyeOff, Globe2, KeyRound, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { apiSend, fetcher } from '@/lib/api';
import type { AccountAccess, AccountGrant, AdminAccount, AdminWorkspace, AppUser, WorkspaceAccess } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/lib/format';
import { Avatar, WorkspaceLogo } from '../Avatar';
import { Badge, Button, Card, Confirm, Field, Modal, Switch, Td, Th, errorText, inputCls, useNotice } from './ui';

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
}

/** "All …" / "Only selected" segmented control. */
function AllOrSelected({ all, onChange, allLabel, label }: { all: boolean; onChange: (all: boolean) => void; allLabel: string; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1 text-sm font-semibold" role="radiogroup" aria-label={label}>
      {[
        { value: true, text: allLabel },
        { value: false, text: 'Only selected' },
      ].map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={all === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-3 py-1.5 transition', all === o.value ? 'bg-bg text-ink shadow-card' : 'text-muted hover:text-ink')}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

const grantKey = (g: AccountGrant) => `${g.workspaceId}/${g.accountId}`;

/** Show / hide each captured Slack account for one user, grouped by the communities that user can see. */
function SlackAccountAccess({
  value,
  onChange,
  role,
  communities,
}: {
  value: AccountAccess;
  onChange: (v: AccountAccess) => void;
  role: AppUser['role'];
  communities: WorkspaceAccess;
}) {
  const { data: accounts } = useSWR<AdminAccount[]>('/api/admin/accounts', fetcher);
  const { data: workspaces } = useSWR<AdminWorkspace[]>('/api/admin/workspaces', fetcher);
  if (role === 'admin') {
    return <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">Admins always see every Slack account.</p>;
  }
  const granted = new Set(value.accounts.map(grantKey));
  const set = (keys: Set<string>) =>
    onChange({
      allAccounts: false,
      accounts: [...keys].map((k) => {
        const i = k.indexOf('/');
        return { workspaceId: k.slice(0, i), accountId: k.slice(i + 1) };
      }),
    });
  // Only communities this user can see are worth configuring.
  const groups = (workspaces ?? [])
    .filter((w) => communities.allWorkspaces || communities.workspaceIds.includes(w.id))
    .map((w) => ({ ws: w, accounts: (accounts ?? []).filter((a) => a.workspaceId === w.id) }))
    .filter((g) => g.accounts.length > 0);

  return (
    <div className="space-y-2">
      <AllOrSelected all={value.allAccounts} onChange={(all) => onChange({ ...value, allAccounts: all })} allLabel="All accounts" label="Slack account access" />
      {value.allAccounts ? (
        <p className="text-xs text-muted">Sees every Slack account in their communities, including ones captured later.</p>
      ) : (
        <div className="scroll-slim max-h-72 overflow-y-auto rounded-lg border border-line">
          {groups.map(({ ws, accounts: list }) => {
            const keys = list.map((a) => grantKey({ workspaceId: ws.id, accountId: a.id }));
            const shown = keys.filter((k) => granted.has(k)).length;
            return (
              <section key={ws.id} className="border-b border-line last:border-b-0">
                <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-subtle px-3 py-1.5 text-xs">
                  <WorkspaceLogo workspace={ws} size={18} />
                  <span className="min-w-0 flex-1 truncate font-bold text-ink">{ws.name ?? ws.id}</span>
                  <span className="text-muted">
                    {shown} of {list.length}
                  </span>
                  <button type="button" className="font-semibold text-muted hover:text-ink" onClick={() => set(new Set([...granted, ...keys]))}>
                    Show all
                  </button>
                  <button
                    type="button"
                    className="font-semibold text-muted hover:text-ink"
                    onClick={() => set(new Set([...granted].filter((k) => !keys.includes(k))))}
                  >
                    Hide all
                  </button>
                </header>
                <ul className="divide-y divide-line">
                  {list.map((a) => {
                    const k = grantKey({ workspaceId: ws.id, accountId: a.id });
                    const on = granted.has(k);
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => {
                            const next = new Set(granted);
                            next.has(k) ? next.delete(k) : next.add(k);
                            set(next);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-hover"
                        >
                          <Avatar name={a.name ?? a.id} url={a.avatarUrl} size={26} className={clsx('transition', !on && 'opacity-40 grayscale')} />
                          <span className="min-w-0 flex-1">
                            <span className={clsx('flex items-center gap-1.5 truncate font-semibold', !on && 'text-muted')}>
                              <span className="truncate">{a.name ?? a.id}</span>
                              {a.isHidden && (
                                <Badge tone="warn" title="Hidden from every viewer in Admin → Content; this switch has no effect until it is shown again">
                                  <EyeOff size={11} /> hidden for all
                                </Badge>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted">{fmtNumber(a.channelCount)} conversations</span>
                          </span>
                          <Switch on={on} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {accounts && groups.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted">No Slack accounts in this user&apos;s communities yet.</p>}
          {granted.size === 0 && groups.length > 0 && (
            <p className="border-t border-line bg-subtle px-3 py-1.5 text-xs text-warn">This user will see no Slack accounts in the &ldquo;view as&rdquo; picker.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Show / hide each community (Slack workspace) for one user. */
function CommunityAccess({ value, onChange, role }: { value: WorkspaceAccess; onChange: (v: WorkspaceAccess) => void; role: AppUser['role'] }) {
  const { data: workspaces } = useSWR<AdminWorkspace[]>('/api/admin/workspaces', fetcher);
  const granted = new Set(value.workspaceIds);
  const toggle = (id: string) => {
    const next = new Set(granted);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ allWorkspaces: false, workspaceIds: [...next] });
  };
  if (role === 'admin') {
    return <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">Admins always see every community.</p>;
  }
  const list = workspaces ?? [];
  return (
    <div className="space-y-2">
      <AllOrSelected
        all={value.allWorkspaces}
        onChange={(all) => onChange({ ...value, allWorkspaces: all })}
        allLabel="All communities"
        label="Community access"
      />
      {value.allWorkspaces ? (
        <p className="text-xs text-muted">Sees every community, including ones captured later.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-subtle px-3 py-1.5 text-xs text-muted">
            <span>
              {granted.size} of {list.length} shown
            </span>
            <span className="flex gap-2 font-semibold">
              <button type="button" className="hover:text-ink" onClick={() => onChange({ allWorkspaces: false, workspaceIds: list.map((w) => w.id) })}>
                Show all
              </button>
              <button type="button" className="hover:text-ink" onClick={() => onChange({ allWorkspaces: false, workspaceIds: [] })}>
                Hide all
              </button>
            </span>
          </div>
          <ul className="scroll-slim max-h-64 divide-y divide-line overflow-y-auto">
            {list.map((w) => {
              const on = granted.has(w.id);
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle(w.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-hover"
                  >
                    <WorkspaceLogo workspace={w} size={28} className={clsx('transition', !on && 'opacity-40 grayscale')} />
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block truncate font-semibold', !on && 'text-muted')}>{w.name ?? w.id}</span>
                      <span className="block truncate text-xs text-muted">
                        {w.domain ? `${w.domain}.slack.com · ` : ''}
                        {fmtNumber(w.messageCount)} messages
                      </span>
                    </span>
                    <Switch on={on} />
                  </button>
                </li>
              );
            })}
            {workspaces && list.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No communities captured yet.</li>}
          </ul>
          {granted.size === 0 && (
            <p className="border-t border-line bg-subtle px-3 py-1.5 text-xs text-warn">This user will see no communities.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** "All", or the logos of the communities a viewer can see. */
function AccessSummary({ user, workspaces }: { user: AppUser; workspaces: AdminWorkspace[] }) {
  if (user.role === 'admin' || user.allWorkspaces) return <Badge tone="good">all communities</Badge>;
  const shown = workspaces.filter((w) => user.workspaceIds.includes(w.id));
  if (!shown.length) return <Badge tone="warn">none</Badge>;
  return (
    <div className="flex items-center gap-1.5" title={shown.map((w) => w.name ?? w.id).join(', ')}>
      <div className="flex -space-x-1.5">
        {shown.slice(0, 4).map((w) => (
          <WorkspaceLogo key={w.id} workspace={w} size={22} className="ring-2 ring-bg" />
        ))}
      </div>
      <span className="text-xs text-muted">
        {shown.length} of {workspaces.length}
      </span>
    </div>
  );
}

/** "All", or the avatars of the Slack accounts a viewer can see. */
function AccountSummary({ user, accounts }: { user: AppUser; accounts: AdminAccount[] }) {
  if (user.role === 'admin' || user.allAccounts) return <Badge tone="good">all accounts</Badge>;
  const keys = new Set(user.accounts.map(grantKey));
  const shown = accounts.filter((a) => keys.has(grantKey({ workspaceId: a.workspaceId, accountId: a.id })));
  if (!shown.length) return <Badge tone="warn">none</Badge>;
  return (
    <div className="flex items-center gap-1.5" title={shown.map((a) => a.name ?? a.id).join(', ')}>
      <div className="flex -space-x-1.5">
        {shown.slice(0, 4).map((a) => (
          <Avatar key={grantKey({ workspaceId: a.workspaceId, accountId: a.id })} name={a.name ?? a.id} url={a.avatarUrl} size={22} className="ring-2 ring-bg" />
        ))}
      </div>
      <span className="text-xs text-muted">
        {shown.length} of {accounts.length}
      </span>
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user?: AppUser; onClose: () => void; onSaved: (msg: string) => void }) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<AppUser['role']>(user?.role ?? 'viewer');
  const [password, setPassword] = useState(user ? '' : randomPassword());
  const [access, setAccess] = useState<WorkspaceAccess>({ allWorkspaces: user?.allWorkspaces ?? true, workspaceIds: user?.workspaceIds ?? [] });
  const [acctAccess, setAcctAccess] = useState<AccountAccess>({ allAccounts: user?.allAccounts ?? true, accounts: user?.accounts ?? [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessChanged =
    !user || access.allWorkspaces !== user.allWorkspaces || [...access.workspaceIds].sort().join() !== [...user.workspaceIds].sort().join();
  const acctChanged =
    !user ||
    acctAccess.allAccounts !== user.allAccounts ||
    acctAccess.accounts.map(grantKey).sort().join() !== user.accounts.map(grantKey).sort().join();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await apiSend('PATCH', `/api/admin/users/${user.id}`, { name, role, ...(password ? { password } : {}) });
        if (accessChanged) await apiSend('PUT', `/api/admin/users/${user.id}/workspaces`, access);
        if (acctChanged) await apiSend('PUT', `/api/admin/users/${user.id}/accounts`, acctAccess);
        onSaved(password ? `Saved. New password for ${user.email}: ${password}` : 'User saved');
      } else {
        await apiSend('POST', '/api/admin/users', { email, name, role, password, access, accountAccess: acctAccess });
        onSaved(`Created ${email}. Temporary password: ${password}`);
      }
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `Edit ${user.email}` : 'Add user'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={save} disabled={!user && !email}>
            {user ? 'Save' : 'Create user'}
          </Button>
        </>
      }
    >
      {!user && (
        <Field label="Email">
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
      )}
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Role" hint="Admins manage users, browsers and content. Viewers can browse, search and analyze, and never see hidden conversations.">
        <select value={role} onChange={(e) => setRole(e.target.value as AppUser['role'])} className={inputCls}>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <div className="text-sm font-semibold">
        Communities
        <div className="mb-1.5 text-xs font-normal text-muted">Choose which Slack communities this user can see. Changes apply immediately.</div>
        <div className="font-normal">
          <CommunityAccess value={access} onChange={setAccess} role={role} />
        </div>
      </div>
      <div className="text-sm font-semibold">
        Slack accounts
        <div className="mb-1.5 text-xs font-normal text-muted">
          Choose which captured Slack accounts this user sees in the &ldquo;view as&rdquo; picker and conversation credits. Messages stay visible under
          &ldquo;All accounts&rdquo;.
        </div>
        <div className="font-normal">
          <SlackAccountAccess value={acctAccess} onChange={setAcctAccess} role={role} communities={access} />
        </div>
      </div>
      <Field label={user ? 'Reset password (leave empty to keep)' : 'Temporary password'} hint="At least 8 characters. Share it with the user securely; it is shown once.">
        <div className="flex gap-2">
          <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} font-mono`} />
          <Button type="button" onClick={() => setPassword(randomPassword())}>
            Generate
          </Button>
        </div>
      </Field>
      {error && <p className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}

function ChangeOwnPassword({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Change my password"
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
                await apiSend('POST', '/api/auth/password', { currentPassword, newPassword });
                onSaved('Password changed');
                onClose();
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            Change password
          </Button>
        </>
      }
    >
      <Field label="Current password">
        <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
      </Field>
      <Field label="New password" hint="At least 8 characters">
        <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={inputCls} />
      </Field>
      {error && <p className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}

export function AdminUsers() {
  const { me } = useAuth();
  const { data: users, mutate } = useSWR<AppUser[]>('/api/admin/users', fetcher);
  const { data: workspaces } = useSWR<AdminWorkspace[]>('/api/admin/workspaces', fetcher);
  const { data: allAccounts } = useSWR<AdminAccount[]>('/api/admin/accounts', fetcher);
  const notice = useNotice();
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AppUser | null>(null);
  const [ownPw, setOwnPw] = useState(false);

  const setActive = async (u: AppUser, isActive: boolean) => {
    try {
      await apiSend('PATCH', `/api/admin/users/${u.id}`, { isActive });
      notice.ok(`${u.email} ${isActive ? 'activated' : 'deactivated'}`);
      mutate();
    } catch (e) {
      notice.fail(e);
    }
  };

  return (
    <>
      <Card
        title={`Dashboard users${users ? ` · ${users.length}` : ''}`}
        actions={
          <>
            <Button onClick={() => setOwnPw(true)}>
              <KeyRound size={14} /> My password
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={14} /> Add user
            </Button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-sm">
            <thead className="bg-subtle">
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Communities</Th>
                <Th>Slack accounts</Th>
                <Th>Last sign-in</Th>
                <Th>Sessions</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name ?? u.email} size={30} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {u.name ?? u.email} {u.id === me?.id && <span className="text-xs font-normal text-muted">(you)</span>}
                        </div>
                        <div className="truncate text-xs text-muted">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{u.role}</Badge>
                  </Td>
                  <Td>{u.isActive ? <Badge tone="good">active</Badge> : <Badge tone="bad">deactivated</Badge>}</Td>
                  <Td>
                    <button
                      onClick={() => setEditing(u)}
                      disabled={u.role === 'admin'}
                      title={u.role === 'admin' ? 'Admins see every community' : 'Change which communities this user sees'}
                      className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors enabled:hover:bg-hover"
                    >
                      <AccessSummary user={u} workspaces={workspaces ?? []} />
                      {u.role !== 'admin' && <Globe2 size={13} className="text-muted" />}
                    </button>
                  </Td>
                  <Td>
                    <button
                      onClick={() => setEditing(u)}
                      disabled={u.role === 'admin'}
                      title={u.role === 'admin' ? 'Admins see every Slack account' : 'Change which Slack accounts this user sees'}
                      className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors enabled:hover:bg-hover"
                    >
                      <AccountSummary user={u} accounts={allAccounts ?? []} />
                    </button>
                  </Td>
                  <Td title={fmtDateTime(u.lastLoginAt)}>{u.lastLoginAt ? fmtRelative(u.lastLoginAt) : <span className="text-muted">never</span>}</Td>
                  <Td className="tabular-nums">{u.activeSessions}</Td>
                  <Td>{fmtDateTime(u.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                      {u.id !== me?.id &&
                        (u.isActive ? (
                          <Button variant="ghost" onClick={() => setActive(u, false)} title="Deactivate (signs the user out)">
                            <UserX size={14} />
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={() => setActive(u, true)} title="Activate">
                            <UserCheck size={14} />
                          </Button>
                        ))}
                      {u.id !== me?.id && (
                        <Button variant="ghost" onClick={() => setDeleting(u)} title="Delete user" className="text-bad">
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <UserForm
          user={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            notice.ok(m, /password/i.test(m));
            mutate();
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete user"
          body={
            <>
              Delete <b>{deleting.email}</b>? They are signed out immediately. Their entries in the audit log are kept.
            </>
          }
          confirmLabel="Delete user"
          onConfirm={async () => {
            await apiSend('DELETE', `/api/admin/users/${deleting.id}`);
            notice.ok(`Deleted ${deleting.email}`);
            mutate();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
      {ownPw && <ChangeOwnPassword onClose={() => setOwnPw(false)} onSaved={(m) => notice.ok(m)} />}
      {notice.el}
    </>
  );
}
