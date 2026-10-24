'use client';

import clsx from 'clsx';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { Fragment } from 'react';
import type { Message } from '@/lib/api';
import { emoji, fmtDateTime, fmtTime } from '@/lib/format';
import { Attachments } from './Attachments';
import { Avatar } from './Avatar';

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Renders plain text with clickable links and highlighted search terms. Never injects HTML. */
export function RichText({ text, highlight = [] }: { text: string; highlight?: string[] }) {
  const terms = highlight.filter((t) => t.length > 1);
  const hlRe = terms.length ? new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi') : null;

  const renderPlain = (s: string, key: string) =>
    hlRe
      ? s.split(hlRe).map((part, i) =>
          i % 2 === 1 ? (
            <mark key={`${key}-${i}`} className="rounded-sm bg-mark px-0.5 text-inherit">
              {part}
            </mark>
          ) : (
            <Fragment key={`${key}-${i}`}>{part}</Fragment>
          ),
        )
      : s;

  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="break-all text-accent hover:underline">
            {renderPlain(part, `u${i}`)}
          </a>
        ) : (
          <Fragment key={i}>{renderPlain(part, `t${i}`)}</Fragment>
        ),
      )}
    </>
  );
}

export function MessageMeta({ m, onOpenThread }: { m: Message; onOpenThread?: () => void }) {
  return (
    <>
      {m.reactions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {m.reactions.map((r) => (
            <span
              key={r.emoji}
              title={`:${r.emoji}:`}
              className="flex items-center gap-1 rounded-full border border-line bg-subtle px-2 py-0.5 text-xs transition-colors hover:border-accent/40 hover:bg-accent-soft"
            >
              <span className="text-sm leading-none">{emoji(r.emoji)}</span>
              <span className="font-semibold text-muted">{r.count}</span>
            </span>
          ))}
        </div>
      )}
      {m.files.length > 0 && <Attachments files={m.files} />}
      {m.replyCount > 0 &&
        (onOpenThread ? (
          <button onClick={onOpenThread} className="-mx-1 mt-1 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] font-bold text-accent transition-colors hover:bg-accent-soft">
            <MessageSquareText size={14} />
            {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        ) : (
          <div className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-accent">
            <MessageSquareText size={14} />
            {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
          </div>
        ))}
    </>
  );
}

export function MessageItem({
  m,
  compact,
  highlighted,
  highlight,
  onOpenThread,
  onDelete,
}: {
  m: Message;
  compact: boolean;
  highlighted?: boolean;
  highlight?: string[];
  onOpenThread?: () => void;
  /** Admins only: delete this message from the archive. */
  onDelete?: () => void;
}) {
  return (
    <div
      id={`msg-${m.ts}`}
      data-ts={m.ts}
      className={clsx('group relative flex gap-2 px-5 transition-colors duration-100 hover:bg-hover', compact ? 'py-0.5' : 'pb-1 pt-2', highlighted && 'flash')}
    >
      <div className="w-9 flex-none">
        {compact ? (
          <time
            dateTime={m.sentAt}
            title={fmtDateTime(m.sentAt)}
            className="invisible block pt-[3px] text-right text-[11px] text-muted group-hover:visible"
          >
            {fmtTime(m.sentAt).replace(/\s?[AP]M$/i, '')}
          </time>
        ) : (
          <Avatar name={m.userName} url={m.avatarUrl} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="font-black">{m.userName ?? 'Unknown'}</span>
            {m.isBot && <span className="rounded bg-subtle px-1 text-[10px] font-semibold uppercase text-muted">App</span>}
            <time dateTime={m.sentAt} title={fmtDateTime(m.sentAt)} className="text-xs text-muted hover:underline">
              {fmtTime(m.sentAt)}
            </time>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words leading-[1.47]">
          <RichText text={m.text} highlight={highlight} />
          {m.isEdited && <span className="ml-1 text-xs text-muted">(edited)</span>}
        </div>
        <MessageMeta m={m} onOpenThread={onOpenThread} />
      </div>
      {onDelete && (
        <div className="pointer-events-none absolute -top-3 right-4 flex rounded-lg border border-line bg-bg opacity-0 shadow-card transition-opacity duration-100 group-hover:pointer-events-auto group-hover:opacity-100">
          {onOpenThread && m.replyCount > 0 && (
            <button onClick={onOpenThread} title="Open thread" className="rounded-l-lg p-1.5 transition-colors hover:bg-hover">
              <MessageSquareText size={14} />
            </button>
          )}
          <button onClick={onDelete} title="Delete message (admin)" className="rounded-lg p-1.5 text-bad transition-colors hover:bg-hover">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
