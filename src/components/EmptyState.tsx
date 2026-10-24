import { API_URL } from '@/lib/api';

export function EmptyState({ title, backendError = false, noAccess = false }: { title: string; backendError?: boolean; noAccess?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="max-w-lg">
        <h1 className="mb-2 text-2xl font-black">{title}</h1>
        {noAccess ? (
          <p className="text-muted">No Slack communities are shared with your account yet. Ask an administrator to give you access under Admin → Users.</p>
        ) : backendError ? (
          <p className="text-muted">
            The frontend could not reach the backend at <code className="rounded bg-subtle px-1">{API_URL}</code>. Check that the backend is running and{' '}
            <code className="rounded bg-subtle px-1">{API_URL}/health</code> answers.
          </p>
        ) : (
          <>
            <p className="mb-4 text-muted">Capture history with the Chrome extension and it will show up here in real time.</p>
            <ol className="list-decimal space-y-2 pl-5 text-[15px]">
              <li>
                Open <code className="rounded bg-subtle px-1">chrome://extensions</code>, enable Developer mode, click <b>Load unpacked</b> and
                pick the <code className="rounded bg-subtle px-1">slack-analyze-extension</code> folder.
              </li>
              <li>
                In the extension&apos;s <b>Settings</b> tab, set Backend URL to <code className="rounded bg-subtle px-1">{API_URL}</code> and
                the API key to the backend&apos;s <code className="rounded bg-subtle px-1">INGEST_API_KEY</code>.
              </li>
              <li>
                Open <code className="rounded bg-subtle px-1">app.slack.com</code>, pick a range, and click <b>Sync open channel</b> — or load
                the sidebar under <b>Channels</b> and sync a selection.
              </li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
