'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher, qs, type Account, type Workspace } from './api';

interface WorkspaceCtx {
  workspaces: Workspace[];
  workspace: Workspace | null;
  setWorkspaceId: (id: string) => void;
  /** Slack accounts (one per browser that captured) in the selected workspace. */
  accounts: Account[];
  /** The account whose view is shown; defaults to the first account, null only when there are none. */
  account: Account | null;
  setAccountId: (id: string | null) => void;
  isLoading: boolean;
  error: unknown;
}

const Ctx = createContext<WorkspaceCtx | null>(null);
const STORAGE_KEY = 'slack-analyze.workspace';
const ACCOUNT_KEY = 'slack-analyze.account';

function store(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading } = useSWR<Workspace[]>('/api/workspaces', fetcher, { refreshInterval: 60_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSelected(localStorage.getItem(STORAGE_KEY));
      setSelectedAccount(localStorage.getItem(ACCOUNT_KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const workspaces = useMemo(() => data ?? [], [data]);
  const workspace = workspaces.find((w) => w.id === selected) ?? workspaces[0] ?? null;
  const { data: accountData } = useSWR<Account[]>(
    workspace ? `/api/accounts${qs({ workspaceId: workspace.id })}` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const value = useMemo<WorkspaceCtx>(() => {
    const accounts = accountData ?? [];
    return {
      workspaces,
      workspace,
      accounts,
      // No combined view: fall back to the first account when none (or a gone one) is selected.
      account: accounts.find((a) => a.id === selectedAccount) ?? accounts[0] ?? null,
      isLoading,
      error,
      setWorkspaceId: (id) => {
        setSelected(id);
        store(STORAGE_KEY, id);
        // Accounts are per workspace.
        setSelectedAccount(null);
        store(ACCOUNT_KEY, null);
      },
      setAccountId: (id) => {
        setSelectedAccount(id);
        store(ACCOUNT_KEY, id);
      },
    };
  }, [workspaces, workspace, accountData, selectedAccount, isLoading, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
