import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { getEventById } from '@/server/actions/event-actions';
import { LoadingState } from '@jarvis/ui-core';
import { getBlueprintForEvent, getResearchForEvent, getGlossaryForEvent } from '@/server/data/context';

// Lazy load the heavy LiveEventPageContent component
const LiveEventPageContent = dynamic(
  () => import('@/features/events/components/live-event-page-content').then((mod) => ({ default: mod.LiveEventPageContent })),
  {
    loading: () => <LoadingState title="Loading event" description="Preparing event page..." />,
  }
);

type Props = {
  params: Promise<{ eventId: string }>;
};

async function prefetchContextData(queryClient: QueryClient, eventId: string) {
  // Prefetch blueprint data
  await queryClient.prefetchQuery({
    queryKey: ['blueprint-full', eventId],
    queryFn: async () => {
      const { data } = await getBlueprintForEvent(eventId);
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Prefetch research data
  await queryClient.prefetchQuery({
    queryKey: ['research', eventId],
    queryFn: async () => {
      const { data } = await getResearchForEvent(eventId);
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Prefetch glossary data
  await queryClient.prefetchQuery({
    queryKey: ['glossary', eventId],
    queryFn: async () => {
      const { data } = await getGlossaryForEvent(eventId);
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export default async function LiveEventPage({ params }: Props) {
  const { eventId } = await params;
  const { data: event, error } = await getEventById(eventId);

  // Create a new QueryClient for this request
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
        gcTime: 1000 * 60 * 10,
      },
    },
  });

  // Prefetch context data on the server
  if (event) {
    await prefetchContextData(queryClient, eventId);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LiveEventPageContent event={event} eventId={eventId} error={error} />
    </HydrationBoundary>
  );
}
