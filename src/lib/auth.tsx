'use client';

import { createContext, useContext } from 'react';
import useSWR from 'swr';
import { apiSend, fetcher } from './api';

export interface Me {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'viewer';
  /** false: this viewer only sees the communities an admin granted. */
  allWorkspaces: boolean;
}

interface AuthCtx {
  me: Me | null;
  isAdmin: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // A 401 here redirects to /login (see fetcher).
  const { data, isLoading } = useSWR<Me>('/api/auth/me', fetcher, { shouldRetryOnError: false, revalidateOnFocus: true });
  const value: AuthCtx = {
    me: data ?? null,
    isAdmin: data?.role === 'admin',
    isLoading,
    logout: async () => {
      await apiSend('POST', '/api/auth/logout').catch(() => {});
      window.location.href = '/login';
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
