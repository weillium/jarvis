import { getEventById } from '@/server/actions/event-actions';
import { LiveEventPageContent } from '@/features/events/components/live-event-page-content';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function LiveEventPage({ params }: Props) {
  const { eventId } = await params;
  const { data: event, error } = await getEventById(eventId);

  return <LiveEventPageContent event={event} eventId={eventId} error={error} />;
}
