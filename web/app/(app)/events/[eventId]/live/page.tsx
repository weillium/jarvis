import dynamic from 'next/dynamic';
import { getEventById } from '@/server/actions/event-actions';
import { LoadingState } from '@jarvis/ui-core';

// Lazy load the heavy LiveEventPageContent component
const LiveEventPageContent = dynamic(
  () => import('@/features/events/components/live-event-page-content').then((mod) => ({ default: mod.LiveEventPageContent })),
  {
    loading: () => <LoadingState title="Loading event" description="Preparing event page..." padding="$10 $6" />,
  }
);

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function LiveEventPage({ params }: Props) {
  const { eventId } = await params;
  const { data: event, error } = await getEventById(eventId);

  return <LiveEventPageContent event={event} eventId={eventId} error={error} />;
}
