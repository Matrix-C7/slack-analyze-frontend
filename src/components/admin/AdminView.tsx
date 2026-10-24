'use client';

import clsx from 'clsx';
import { Activity, Database, Globe, ScrollText, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '../PageHeader';
import { AdminAudit } from './AdminAudit';
import { AdminCollectors } from './AdminCollectors';
import { AdminContent } from './AdminContent';
import { AdminOverview } from './AdminOverview';
import { AdminUsers } from './AdminUsers';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity, view: AdminOverview },
  { id: 'content', label: 'Content', icon: Database, view: AdminContent },
  { id: 'collectors', label: 'Browsers', icon: Globe, view: AdminCollectors },
  { id: 'users', label: 'Users', icon: Users, view: AdminUsers },
  { id: 'audit', label: 'Audit log', icon: ScrollText, view: AdminAudit },
] as const;

export function AdminView() {
  const { isAdmin } = useAuth();
  const tabId = useSearchParams().get('tab') ?? 'overview';
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-black">Admins only</h1>
          <p className="text-muted">Ask an administrator for access.</p>
        </div>
      </div>
    );
  }

  const View = tab.view;
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Admin" subtitle="Status, content, browsers and users" />
      <nav className="flex flex-none gap-1 overflow-x-auto border-b border-line px-4 md:px-6" aria-label="Admin sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin?tab=${t.id}`}
            aria-current={t.id === tab.id ? 'page' : undefined}
            className={clsx(
              '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-150',
              t.id === tab.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:border-line hover:text-ink',
            )}
          >
            <t.icon size={15} /> {t.label}
          </Link>
        ))}
      </nav>
      <div className="scroll-slim flex-1 overflow-y-auto bg-subtle p-4 md:p-6">
        <div key={tab.id} className="animate-fade-in">
          <View />
        </div>
      </div>
    </div>
  );
}
