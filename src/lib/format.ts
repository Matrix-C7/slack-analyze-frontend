import type { ConversationType } from './api';

const nf = new Intl.NumberFormat();
export const fmtNumber = (n: number) => nf.format(Math.round(n));

export function fmtCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(iso: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  return iso ? new Date(iso).toLocaleDateString(undefined, opts) : '—';
}

export function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function fmtRelative(iso: string | null) {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (diff < 60) return 'just now';
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return fmtDate(iso);
}

/** Slack-style day divider label: Today / Yesterday / Monday, October 20th */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export const isDm = (t: ConversationType) => t === 'dm' || t === 'group_dm';

export function typeLabel(t: ConversationType) {
  return { public: 'Public channel', private: 'Private channel', dm: 'Direct message', group_dm: 'Group DM', unknown: 'Channel' }[t];
}

/** Stable avatar color from a name (Slack-like palette). */
const AVATAR_COLORS = ['#e8912d', '#2bac76', '#1264a3', '#e01e5a', '#4a154b', '#36c5f0', '#ecb22e', '#8c5ad9', '#3aa3a3'];
export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Common Slack shortcodes → emoji. Unknown codes render as :code:. */
const EMOJI: Record<string, string> = {
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎', heart: '❤️', joy: '😂', smile: '😄', slightly_smiling_face: '🙂',
  tada: '🎉', fire: '🔥', eyes: '👀', pray: '🙏', clap: '👏', white_check_mark: '✅', heavy_check_mark: '✔️', x: '❌',
  raised_hands: '🙌', rocket: '🚀', '100': '💯', thinking_face: '🤔', ok_hand: '👌', muscle: '💪', wave: '👋',
  sweat_smile: '😅', rolling_on_the_floor_laughing: '🤣', grinning: '😀', star: '⭐', heart_eyes: '😍', sob: '😭',
  warning: '⚠️', point_up: '☝️', bulb: '💡', memo: '📝', party_popper: '🎉', saluting_face: '🫡', handshake: '🤝',
  heavy_plus_sign: '➕', exclamation: '❗', question: '❓', moneybag: '💰', chart_with_upwards_trend: '📈',
};
export function emoji(code: string) {
  const base = code.replace(/::skin-tone-\d$/, '');
  if (EMOJI[base]) return EMOJI[base];
  // The extension may already have captured a unicode emoji (from <img alt="👍">).
  if (/\p{Extended_Pictographic}/u.test(code)) return code;
  return `:${code}:`;
}

export function fmtBytes(n: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
