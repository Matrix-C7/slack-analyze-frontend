import type { ConversationType } from './api';

export interface AdminOverview {
  totals: {
    messages: number;
    threadReplies: number;
    messages24h: number;
    lastIngestAt: string | null;
    channels: number;
    hiddenChannels: number;
    excludedChannels: number;
    workspaces: number;
    people: number;
    accounts: number;
    collectors: number;
    collectorsOnline: number;
    collectorsPaused: number;
    appUsers: number;
    deletedMessages: number;
    commandsOpen: number;
  };
  runs24h: { completed: number; failed: number; running: number; cancelled: number };
  hourly: { hour: string; messages: number }[];
  recentFailures: { id: string; workspaceId: string; channelId: string | null; channelName: string | null; error: string | null; startedAt: string; collector: string | null }[];
  databaseBytes: number;
}

export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'viewer';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  activeSessions: number;
  /** true: sees every community, including ones captured later. Admins always see all. */
  allWorkspaces: boolean;
  /** Communities granted when allWorkspaces is false. */
  workspaceIds: string[];
  /** true: sees every Slack account, including ones captured later. Admins always see all. */
  allAccounts: boolean;
  /** Slack accounts granted when allAccounts is false. */
  accounts: AccountGrant[];
}

export interface AccountGrant {
  workspaceId: string;
  accountId: string;
}

export interface AccountAccess {
  allAccounts: boolean;
  accounts: AccountGrant[];
}

export interface WorkspaceAccess {
  allWorkspaces: boolean;
  workspaceIds: string[];
}

export type CollectorStatus = 'active' | 'paused' | 'revoked';

export interface AdminCollector {
  id: string;
  label: string | null;
  browser: string | null;
  version: string | null;
  status: CollectorStatus;
  notes: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  accountId: string | null;
  accountName: string | null;
  accountAvatar: string | null;
  online: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  lastRunAt: string | null;
  runCount: number;
  failed24h: number;
  messagesReceived: number;
  openCommands: number;
}

export type CommandType = 'sync_channels' | 'sync_open' | 'refresh_channels' | 'stop' | 'set_settings';

export interface AdminCommand {
  id: number;
  collectorId: string;
  collector: string | null;
  type: CommandType;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'done' | 'failed' | 'cancelled';
  result: string | null;
  createdBy: string | null;
  createdAt: string;
  deliveredAt: string | null;
  finishedAt: string | null;
}

export interface AdminWorkspace {
  id: string;
  name: string | null;
  domain: string | null;
  iconUrl: string | null;
  retentionDays: number | null;
  messageCount: number;
  channelCount: number;
  oldestMessageAt: string | null;
  createdAt: string;
}

export interface AdminChannel {
  id: string;
  name: string;
  type: ConversationType;
  isHidden: boolean;
  captureExcluded: boolean;
  reachedStart: boolean;
  lastSyncedAt: string | null;
  messageCount: number;
  replyCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  accountCount: number;
}

/** A captured Slack account of one community, as listed in Admin → Content. */
export interface AdminAccount {
  workspaceId: string;
  id: string;
  name: string | null;
  avatarUrl: string | null;
  isHidden: boolean;
  online: boolean;
  channelCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncedAt: string | null;
}

export interface AuditEntry {
  id: number;
  userEmail: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export const COMMAND_LABEL: Record<CommandType, string> = {
  sync_channels: 'Sync conversations',
  sync_open: 'Sync open conversation',
  refresh_channels: 'Refresh conversation list',
  stop: 'Stop sync',
  set_settings: 'Update settings',
};

export { fmtBytes } from './format';

/** File archive status (Admin → Overview). */
export interface AdminFiles {
  storage: 'local' | 's3';
  maxBytes: number;
  counts: { stored: number; pending: number; failed: number; skipped: number };
  /** Distinct stored contents and their total size (a file shared twice is stored once). */
  blobs: number;
  bytes: number;
  byKind: { kind: string; files: number; bytes: number }[];
  recentFailures: {
    id: number;
    name: string | null;
    kind: string | null;
    attempts: number;
    error: string | null;
    workspaceId: string;
    channelId: string;
    channelName: string;
    ts: string;
    sentAt: string;
  }[];
}
