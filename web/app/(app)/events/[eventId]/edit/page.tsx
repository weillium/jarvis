'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '@jarvis/ui-core';

// Lazy load the edit page component (heavy with dayjs, file uploads, etc.)
const EditEventPageContent = dynamic(
  () => import('./edit-event-page-content'),
  {
    loading: () => <LoadingState title="Loading editor" description="Preparing event editor..." />,
  }
);

export default function EditEventPage() {
  return <EditEventPageContent />;
}
