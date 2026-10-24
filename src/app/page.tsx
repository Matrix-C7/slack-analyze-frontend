'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useSWR from 'swr';
import { EmptyState } from '@/components/EmptyState';
import { fetcher, qs, type Channel } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';

export default function Home() {
  const router = useRouter();
  const { workspace, account, isLoading, error } = useWorkspace();
  const { me } = useAuth();
  const { data: channels } = useSWR<Channel[]>(workspace ? `/api/channels${qs({ workspaceId: workspace.id, accountId: account?.id })}` : null, fetcher);

  useEffect(() => {
    if (!workspace || !channels) return;
    const latest = [...channels].filter((c) => c.lastMessageAt).sort((a, b) => b.lastMessageAt!.localeCompare(a.lastMessageAt!))[0];
    if (latest) router.replace(`/c/${workspace.id}/${latest.id}`);
  }, [workspace, channels, router]);

  if (error) return <EmptyState title="Backend unreachable" backendError />;
  if (isLoading || (workspace && !channels)) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!workspace && me?.role === 'viewer' && !me.allWorkspaces) return <EmptyState title="No communities shared with you" noAccess />;
  if (account && channels?.every((c) => !c.lastMessageAt)) {
    return <EmptyState title={`Nothing captured as ${account.name ?? account.id} yet`} />;
  }
  if (!workspace || channels?.every((c) => !c.lastMessageAt)) return <EmptyState title="No Slack history captured yet" />;
  return null;
}
