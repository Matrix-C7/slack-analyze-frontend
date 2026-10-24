'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CloudOff, Download, ExternalLink, FileText, Film, ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type FileRef, fileContentUrl } from '@/lib/api';
import { fmtBytes } from '@/lib/format';

const isImage = (f: FileRef) => f.status === 'stored' && (f.kind === 'image' || f.mimeType?.startsWith('image/') === true);
const isVideo = (f: FileRef) => f.status === 'stored' && f.variant === 'original' && (f.kind === 'video' || f.mimeType?.startsWith('video/') === true);

function KindIcon({ kind, size = 18 }: { kind: string | null; size?: number }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : kind === 'pdf' || kind === 'doc' ? FileText : Paperclip;
  return <Icon size={size} className="flex-none text-accent" />;
}

/** "PDF · 2.4 MB" */
function fileMeta(f: FileRef) {
  const ext = f.name?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  const type = ext ? ext.toUpperCase() : f.mimeType?.split('/')[1]?.toUpperCase();
  return [type, f.size != null ? fmtBytes(f.size) : null].filter(Boolean).join(' · ');
}

const STATUS_NOTE: Record<Exclude<FileRef['status'], 'stored'>, { label: string; title: string }> = {
  pending: { label: 'Saving a copy…', title: 'A browser with the extension will download this file shortly' },
  failed: { label: 'Only in Slack', title: 'The file could not be downloaded (deleted in Slack, or no access)' },
  skipped: { label: 'Only in Slack', title: 'Not archived: over the size limit, a file type that is turned off, or an external link' },
};

/** A file we hold a copy of: download from the archive; PDFs also open in the browser. */
function StoredFileCard({ f }: { f: FileRef }) {
  return (
    <div className="flex w-72 max-w-full items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2 shadow-card">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-accent-soft">
        <KindIcon kind={f.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <a href={fileContentUrl(f)} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold hover:underline" title={f.name ?? undefined}>
          {f.name || 'Attachment'}
        </a>
        <div className="truncate text-xs text-muted">{fileMeta(f) || 'File'}</div>
      </div>
      <a href={fileContentUrl(f, true)} title="Download" aria-label={`Download ${f.name ?? 'file'}`} className="rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink">
        <Download size={16} />
      </a>
    </div>
  );
}

/** A file only Slack has (yet): link to it there, with the archive state. */
function SlackFileChip({ f }: { f: FileRef }) {
  const note = f.status !== 'stored' ? STATUS_NOTE[f.status] : null;
  return (
    <a
      href={f.url}
      target="_blank"
      rel="noreferrer noopener"
      title={note ? `${note.title}. Opens in Slack.` : f.url}
      className="flex max-w-xs items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-sm shadow-card transition hover:-translate-y-px hover:border-accent/40 hover:bg-hover"
    >
      <KindIcon kind={f.kind} />
      <span className="min-w-0">
        <span className="block truncate">{f.name || 'Attachment'}</span>
        {note && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            {f.status === 'pending' ? <Loader2 size={11} className="animate-spin" /> : <CloudOff size={11} />}
            {note.label}
          </span>
        )}
      </span>
    </a>
  );
}

function ImageThumb({ f, single, onOpen, onBroken }: { f: FileRef; single: boolean; onOpen: () => void; onBroken: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={f.name ?? 'Image'}
      className={clsx(
        'group/img relative overflow-hidden rounded-lg border border-line bg-subtle shadow-card transition hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent',
        single ? 'max-w-[min(100%,420px)]' : 'h-36 w-36',
        !loaded && (single ? 'h-48 w-72' : ''),
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with a session cookie; next/image can't proxy it */}
      <img
        src={fileContentUrl(f)}
        alt={f.name ?? 'Image'}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onBroken}
        className={clsx('block transition-opacity duration-200', single ? 'max-h-80 w-auto' : 'h-full w-full object-cover', loaded ? 'opacity-100' : 'opacity-0')}
      />
      {!loaded && <span className="absolute inset-0 animate-pulse bg-subtle" />}
      {f.variant === 'preview' && (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white" title="The original was larger than the size limit; Slack's preview is archived">
          Preview
        </span>
      )}
    </button>
  );
}

/** Full-screen image viewer: arrow keys switch images, Esc closes. */
function Lightbox({ images, index, onIndex, onClose }: { images: FileRef[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const f = images[index];
  const step = useCallback((d: number) => onIndex((index + d + images.length) % images.length), [index, images.length, onIndex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={f.name ?? 'Image'} className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black/85 backdrop-blur-sm">
      <header className="flex items-center gap-2 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{f.name || 'Image'}</div>
          <div className="text-xs text-white/60">
            {[fileMeta(f), f.variant === 'preview' ? 'Slack preview (original over the size limit)' : null, images.length > 1 ? `${index + 1} of ${images.length}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <a href={fileContentUrl(f, true)} className="rounded-md p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white" title="Download">
          <Download size={18} />
        </a>
        <a href={f.url} target="_blank" rel="noreferrer noopener" className="rounded-md p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white" title="Open in Slack">
          <ExternalLink size={18} />
        </a>
        <button onClick={onClose} className="rounded-md p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={20} />
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={f.id} src={fileContentUrl(f)} alt={f.name ?? 'Image'} className="max-h-full max-w-full animate-pop-in rounded-md object-contain shadow-pop" />
        {images.length > 1 && (
          <>
            <button onClick={() => step(-1)} aria-label="Previous image" className="absolute left-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20">
              <ChevronLeft size={22} />
            </button>
            <button onClick={() => step(1)} aria-label="Next image" className="absolute right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20">
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Files of one message: archived images inline (click to enlarge), videos playable, other files as cards. */
export function Attachments({ files }: { files: FileRef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<number>>(() => new Set());
  const markBroken = (id: number) => setBroken((s) => new Set(s).add(id));

  const images = files.filter((f) => isImage(f) && !broken.has(f.id));
  const videos = files.filter((f) => isVideo(f) && !broken.has(f.id));
  const rest = files.filter((f) => !images.includes(f) && !videos.includes(f));

  return (
    <div className="mt-1.5 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f, i) => (
            <ImageThumb key={f.id} f={f} single={images.length === 1} onOpen={() => setOpen(i)} onBroken={() => markBroken(f.id)} />
          ))}
        </div>
      )}
      {videos.map((f) => (
        <figure key={f.id} className="w-fit max-w-full">
          <video controls preload="metadata" src={fileContentUrl(f)} onError={() => markBroken(f.id)} className="max-h-80 max-w-[min(100%,480px)] rounded-lg border border-line bg-black shadow-card" />
          <figcaption className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">{f.name}</span>
            <a href={fileContentUrl(f, true)} className="flex items-center gap-1 font-semibold text-accent hover:underline">
              <Download size={12} /> Download
            </a>
          </figcaption>
        </figure>
      ))}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rest.map((f) => (f.status === 'stored' && !broken.has(f.id) ? <StoredFileCard key={f.id} f={f} /> : <SlackFileChip key={f.id} f={f} />))}
        </div>
      )}
      {open !== null && images[open] && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}
