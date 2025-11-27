import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { getEventById } from '@/server/actions/event-actions';
import { LoadingState } from '@jarvis/ui-core';

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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // Prefetch blueprint data
  await queryClient.prefetchQuery({
    queryKey: ['blueprint-full', eventId],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/context/${eventId}/blueprint`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      return data.ok ? data.blueprint : null;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Prefetch research data
  await queryClient.prefetchQuery({
    queryKey: ['research', eventId],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/context/${eventId}/research`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  // Prefetch glossary data
  await queryClient.prefetchQuery({
    queryKey: ['glossary', eventId],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/context/${eventId}/glossary`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await res.json();
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
