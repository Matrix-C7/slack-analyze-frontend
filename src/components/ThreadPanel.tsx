'use client';

import { Loader2, X } from 'lucide-react';
import useSWR from 'swr';
import { fetcher, type Message } from '@/lib/api';
import { useLiveEvents } from '@/lib/live';
import { MessageItem } from './MessageItem';

/** Side panel with a thread's captured replies. */
export function ThreadPanel({
  workspaceId,
  channelId,
  parent,
  onClose,
  onDelete,
}: {
  workspaceId: string;
  channelId: string;
  parent: Message;
  onClose: () => void;
  onDelete?: (m: Message) => void;
}) {
  const { data: replies, mutate } = useSWR<Message[]>(`/api/channels/${workspaceId}/${channelId}/threads/${parent.ts}`, fetcher);
  useLiveEvents((e) => {
    if (e.type === 'messages' && e.data.workspaceId === workspaceId && e.data.channelId === channelId) mutate();
  });
  const missing = replies ? Math.max(0, parent.replyCount - replies.length) : 0;

  return (
    <aside className="flex w-[380px] flex-none flex-col border-l border-line bg-bg max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-full max-lg:max-w-md max-lg:shadow-2xl">
      <header className="flex flex-none items-center border-b border-line px-4 py-3">
        <div className="flex-1">
          <h2 className="font-black">Thread</h2>
          <div className="text-xs text-muted">
            {parent.replyCount} {parent.replyCount === 1 ? 'reply' : 'replies'}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close thread" className="rounded p-1 hover:bg-hover">
          <X size={18} />
        </button>
      </header>
      <div className="scroll-slim flex-1 overflow-y-auto pb-4">
        <div className="border-b border-line pb-2">
          <MessageItem m={{ ...parent, replyCount: 0 }} compact={false} />
        </div>
        {!replies && (
          <div className="flex justify-center py-6 text-muted">
            <Loader2 className="animate-spin" size={18} />
          </div>
        )}
        {replies?.map((m, i) => {
          const prev = replies[i - 1];
          const compact = !!prev && prev.userId === m.userId && prev.userName === m.userName;
          return <MessageItem key={m.ts} m={m} compact={compact} onDelete={onDelete ? () => onDelete(m) : undefined} />;
        })}
        {replies && missing > 0 && (
          <p className="px-5 pt-3 text-xs text-muted">
            {replies.length === 0 ? 'Replies' : `${missing} more ${missing === 1 ? 'reply' : 'replies'}`} not captured yet — sync this conversation with
            thread capture on in the extension.
          </p>
        )}
      </div>
    </aside>
  );
}
