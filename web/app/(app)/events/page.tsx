import { getEvents } from '@/server/actions/event-actions';
import { EventsPageClient } from './events-page-client';

/**
 * Server Component: Fetches initial events data server-side
 * This improves initial page load performance and enables better caching
 */
export default async function EventsIndex() {
  // Fetch initial data server-side with default filters
  // This data will be used to hydrate React Query on the client
  const initialData = await getEvents({
    status: 'all',
    page: 1,
    limit: 20,
  });

  return <EventsPageClient initialData={initialData} />;
}
