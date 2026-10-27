export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

export type ConversationType = 'public' | 'private' | 'dm' | 'group_dm' | 'unknown';

export interface Workspace {
  id: string;
  name: string | null;
  domain: string | null;
  /** Slack workspace logo (team icon), when the extension captured one. */
  iconUrl: string | null;
  channelCount: number;
  messageCount: number;
  lastMessageAt: string | null;
}

/** An extension install (one browser or browser profile). */
export interface CollectorRef {
  id: string;
  label: string | null;
  browser: string | null;
  version: string | null;
  lastSeenAt: string;
  online: boolean;
}

/** A Slack user whose browser captured data. */
export interface Account {
  workspaceId: string;
  workspaceName: string | null;
  id: string;
  name: string | null;
  avatarUrl: string | null;
  /** Hidden from viewers by an admin (only admins ever receive hidden accounts). */
  isHidden: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncedAt: string | null;
  channelCount: number;
  capturedChannelCount: number;
  messagesFirstCaptured: number;
  collectors: CollectorRef[];
  online: boolean;
}

export interface AccountRef {
  id: string;
  name: string;
}

/** Someone a direct message is with, including their Slack photo when we have it. */
export interface ChannelPeer {
  name: string;
  avatarUrl: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: ConversationType;
  topic: string | null;
  isArchived: boolean;
  reachedStart: boolean;
  lastSyncedAt: string | null;
  messageCount: number;
  /** Messages newer than this dashboard user's last visit. The whole history counts until the conversation is opened. */
  unreadCount: number;
  /** DM and group-DM participants the sidebar name refers to. Empty for channels. */
  peers: ChannelPeer[];
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  accounts: AccountRef[];
  isHidden?: boolean;
}

export interface ChannelDetail {
  id: string;
  name: string;
  type: ConversationType;
  topic: string | null;
  reachedStart: boolean;
  lastSyncedAt: string | null;
  messageCount: number;
  memberCount: number;
  firstMessageAt: string | null;
  peers: ChannelPeer[];
  accounts: AccountRef[];
}

export interface Reaction {
  emoji: string;
  count: number;
}

/** Archive state of an attached file: stored = we keep a copy; pending = a browser will download it; failed / skipped = only in Slack. */
export type FileStatus = 'pending' | 'stored' | 'failed' | 'skipped';

export interface FileRef {
  id: number;
  name: string | null;
  /** Link to the file in Slack (needs a Slack login). */
  url: string;
  kind: string | null;
  status: FileStatus;
  /** 'preview': the original was over the size limit, so only Slack's preview image is archived. */
  variant: 'original' | 'preview' | null;
  mimeType: string | null;
  size: number | null;
}

/** Archived copy of a file, served by the backend (session cookie, access-checked). */
export const fileContentUrl = (f: Pick<FileRef, 'id'>, download = false) => `${API_URL}/api/files/${f.id}/content${download ? '?download=1' : ''}`;

export interface Message {
  id: number;
  workspaceId: string;
  channelId: string;
  channelName: string;
  channelType: ConversationType;
  ts: string;
  sentAt: string;
  userId: string | null;
  userName: string | null;
  avatarUrl: string | null;
  text: string;
  threadTs: string | null;
  replyCount: number;
  isEdited: boolean;
  isBot: boolean;
  subtype: string | null;
  hasFiles: boolean;
  reactions: Reaction[];
  files: FileRef[];
  rank?: number;
}

export interface MessagePage {
  messages: Message[];
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  results: Message[];
  facets: {
    channels: { workspaceId: string; id: string; name: string; type: ConversationType; count: number }[];
    users: { id: string | null; name: string | null; count: number }[];
    months: { month: string; count: number }[];
  };
}

export interface Analytics {
  range: { from: string; to: string; days: number; tz: string; previous: { from: string; to: string } };
  kpis: {
    messages: number;
    activeChannels: number;
    activeUsers: number;
    messagesWithFiles: number;
    threads: number;
    replies: number;
    reactions: number;
    avgPerDay: number;
    previousMessages: number;
    previousActiveUsers: number;
  };
  daily: { day: string; messages: number; users: number }[];
  topChannels: { workspaceId: string; id: string; name: string; type: ConversationType; messages: number; users: number }[];
  topUsers: { id: string; name: string | null; messages: number; channels: number }[];
  heatmap: { dow: number; hour: number; messages: number }[];
  topReactions: Reaction[];
  byType: { type: ConversationType; messages: number }[];
}

export interface SyncRun {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  channelId: string | null;
  channelName: string | null;
  accountId: string | null;
  accountName: string | null;
  collectorId: string | null;
  collectorLabel: string | null;
  browser: string | null;
  trigger: 'manual' | 'auto' | 'live';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  rangeFrom: string | null;
  oldestSeenAt: string | null;
  messagesReceived: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => res.statusText);
  let message = text;
  try {
    message = JSON.parse(text).error ?? text;
  } catch {
    /* not JSON */
  }
  // Session expired or missing: send the browser to the login page (except from the login page itself).
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  return new ApiError(res.status, message);
}

/** SWR fetcher: pass a path like "/api/workspaces". Sends the session cookie. */
export async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

/** POST / PATCH / DELETE helper; throws ApiError with the backend's message. */
export async function apiSend<T = { ok: boolean }>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined | string[]>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
