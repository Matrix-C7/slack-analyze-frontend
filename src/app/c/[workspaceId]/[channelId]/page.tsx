import { Suspense } from 'react';
import { ChannelView } from '@/components/ChannelView';

export default async function ChannelPage({ params }: { params: Promise<{ workspaceId: string; channelId: string }> }) {
  const { workspaceId, channelId } = await params;
  return (
    <Suspense>
      {/* key: remount (fresh state) when switching conversations */}
      <ChannelView key={`${workspaceId}/${channelId}`} workspaceId={workspaceId} channelId={channelId} />
    </Suspense>
  );
}
