'use client';

import clsx from 'clsx';
import { useEffect, useId, useState } from 'react';
import type { Workspace } from '@/lib/api';
import { avatarColor, initials } from '@/lib/format';

export function Avatar({ name, url, size = 36, className }: { name: string | null; url?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.22) };
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className={clsx('flex-none bg-subtle object-cover', className)} onError={() => setBroken(true)} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: avatarColor(name ?? '?'), fontSize: Math.max(9, size * 0.38) }}
      className={clsx('grid flex-none select-none place-items-center font-bold text-white', className)}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The Slack workspace's own logo (team icon). Until the extension has captured one, a branded tile with the
 * workspace's initials stands in: a gradient from the workspace's stable color, so each community stays recognizable.
 */
export function WorkspaceLogo({ workspace, size = 36, className }: { workspace: Pick<Workspace, 'id' | 'name' | 'iconUrl'>; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [workspace.iconUrl]);
  const radius = Math.round(size * 0.24);
  if (workspace.iconUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={workspace.iconUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: radius }}
        className={clsx('flex-none bg-subtle object-cover', className)}
        onError={() => setBroken(true)}
      />
    );
  }
  const name = workspace.name ?? workspace.id;
  const color = avatarColor(name);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.max(8, size * 0.36),
        background: `linear-gradient(145deg, color-mix(in srgb, ${color} 78%, #fff) 0%, ${color} 45%, color-mix(in srgb, ${color} 62%, #000) 100%)`,
        boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.16), inset 0 1px 0 rgb(255 255 255 / 0.22)',
      }}
      className={clsx('grid flex-none select-none place-items-center font-black tracking-tight text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]', className)}
    >
      {initials(name)}
    </span>
  );
}

/** Slack Analyze app mark (matches src/app/icon.svg and brand/logo.svg): a chat bubble with rising analytics bars and a live dot. */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={clsx('flex-none', className)}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7a2f84" />
          <stop offset="0.55" stopColor="#4a154b" />
          <stop offset="1" stopColor="#2c0a2e" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}-bg)`} />
      <rect width="64" height="64" rx="15" fill={`url(#${id}-shine)`} />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.5" />
      <path
        d="M19 15h26a9 9 0 0 1 9 9v13a9 9 0 0 1-9 9H29.5l-8.6 7.2c-1.3 1.1-3.3.2-3.3-1.5V45.9A9 9 0 0 1 10 37V24a9 9 0 0 1 9-9z"
        fill="#fff"
      />
      <rect x="20.5" y="30" width="6" height="9" rx="3" fill="#4a154b" />
      <rect x="29" y="25" width="6" height="14" rx="3" fill="#4a154b" />
      <rect x="37.5" y="20" width="6" height="19" rx="3" fill="#1d9bd1" />
      <circle cx="50.5" cy="14.5" r="6.3" fill="#2eb67d" stroke="#3f0e40" strokeWidth="2.6" />
    </svg>
  );
}
