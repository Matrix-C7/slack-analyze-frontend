import { Suspense } from 'react';
import { AdminView } from '@/components/admin/AdminView';

export default function AdminPage() {
  return (
    <Suspense>
      <AdminView />
    </Suspense>
  );
}
