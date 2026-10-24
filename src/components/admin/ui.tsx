'use client';

import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';

export function Card({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('overflow-hidden rounded-xl border border-line bg-bg shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="flex-1 font-bold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={clsx('mt-1 text-2xl font-black tabular-nums', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const BADGE = {
  neutral: 'bg-subtle text-muted',
  good: 'bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-good',
  warn: 'bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-warn',
  bad: 'bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-bad',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: keyof typeof BADGE; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', BADGE[tone])}>
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'default' | 'danger' | 'ghost';
export function Button({
  variant = 'default',
  busy,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        variant === 'primary' && 'bg-good text-white hover:brightness-110',
        variant === 'default' && 'border border-line bg-bg shadow-card hover:bg-hover',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        variant === 'ghost' && 'hover:bg-hover',
        className,
      )}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx('scroll-slim max-h-[90dvh] w-full animate-pop-in overflow-y-auto rounded-2xl border border-line bg-bg shadow-pop', wide ? 'max-w-2xl' : 'max-w-md')}>
        <header className="flex items-center border-b border-line px-4 py-3">
          <h2 className="flex-1 font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-ink">
            <X size={16} />
          </button>
        </header>
        <div className="space-y-3 p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {hint && <div className="mt-0.5 text-xs font-normal text-muted">{hint}</div>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

/**
 * Confirmation dialog for destructive actions. With `confirmText`, the user must type it (e.g. a channel name).
 */
export function Confirm({
  title,
  body,
  confirmLabel = 'Confirm',
  confirmText,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = !confirmText || typed === confirmText;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            busy={busy}
            disabled={!ok}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(errorText(e));
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm">{body}</div>
      {confirmText && (
        <Field label={`Type "${confirmText}" to confirm`}>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} />
        </Field>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </Modal>
  );
}

/** Small transient status line for action results. */
export function useNotice() {
  const [notice, setNotice] = useState<{ text: string; tone: 'good' | 'bad'; sticky: boolean } | null>(null);
  useEffect(() => {
    if (!notice || notice.sticky) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const el = notice ? (
    <div
      role="status"
      className={clsx(
        'fixed bottom-4 right-4 z-[60] flex max-w-md animate-slide-up items-start gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-pop',
        notice.tone === 'good' ? 'bg-good' : 'bg-bad',
      )}
    >
      <span className="select-all break-words">{notice.text}</span>
      <button onClick={() => setNotice(null)} aria-label="Dismiss" className="flex-none opacity-80 hover:opacity-100">
        <X size={15} />
      </button>
    </div>
  ) : null;
  return {
    el,
    /** sticky: stays until dismissed (use for anything the admin must copy, like a temporary password). */
    ok: (text: string, sticky = false) => setNotice({ text, tone: 'good', sticky }),
    fail: (e: unknown) => setNotice({ text: errorText(e), tone: 'bad', sticky: false }),
  };
}

/** Visual on/off toggle; the surrounding row or button is the actual switch control. */
export function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={clsx('relative h-5 w-9 flex-none rounded-full transition-colors duration-200', on ? 'bg-good' : 'bg-line')}>
      <span className={clsx('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', on && 'translate-x-4')} />
    </span>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx('px-3 py-2 text-left text-xs font-semibold text-muted', className)}>{children}</th>;
}
export function Td({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={clsx('px-3 py-2 align-middle', className)}>
      {children}
    </td>
  );
}
