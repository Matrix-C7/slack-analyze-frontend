'use client';

import { Loader2, Lock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { BrandMark } from '@/components/Avatar';
import { ApiError, apiSend, fetcher } from '@/lib/api';

function LoginForm() {
  const next = useSearchParams().get('next') || '/';
  const { data: status, error: statusError } = useSWR<{ needsSetup: boolean }>('/api/auth/status', fetcher);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setup = status?.needsSetup ?? false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await apiSend('POST', setup ? '/api/auth/setup' : '/api/auth/login', setup ? { email, name, password } : { email, password });
      // Only same-site relative paths, never an absolute URL from the query string.
      window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the backend.');
      setBusy(false);
    }
  };

  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--rail-2)_18%,var(--bg-subtle)),var(--bg-subtle)_60%)] p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark size={52} className="drop-shadow-md" />
          <div>
            <div className="text-2xl font-black tracking-tight">Slack Analyze</div>
            <div className="text-sm text-muted">{setup ? 'Create the first admin account' : 'Sign in to continue'}</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3.5 rounded-2xl border border-line bg-bg p-6 shadow-pop">
          {statusError && <p className="rounded-md bg-subtle p-2 text-sm text-bad">Backend unreachable.</p>}
          {setup && (
            <p className="rounded-md bg-accent-soft p-2 text-sm">
              No users exist yet. The account you create now becomes the administrator.
            </p>
          )}
          <label className="block text-sm font-semibold">
            Email
            <input type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1 ${input}`} />
          </label>
          {setup && (
            <label className="block text-sm font-semibold">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${input}`} />
            </label>
          )}
          <label className="block text-sm font-semibold">
            Password
            <input
              type="password"
              required
              minLength={setup ? 8 : 1}
              autoComplete={setup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1 ${input}`}
            />
          </label>
          {setup && (
            <label className="block text-sm font-semibold">
              Confirm password
              <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`mt-1 ${input}`} />
            </label>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            disabled={busy || !status}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-good px-3 py-2.5 font-bold text-white shadow-card transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
            {setup ? 'Create admin and sign in' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Accounts are managed by an administrator under Admin → Users.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
