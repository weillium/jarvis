import { useQuery } from '@tanstack/react-query';

/**
 * React Query hook for event data
 * 
 * @param eventId - The event ID to fetch
 * @returns Event data, loading state, error, and refetch function
 */
export function useEventQuery(eventId: string | null) {
  return useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/events/${eventId}`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch event');
      }
      
      return data.event;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60, // 1 minute (events change less frequently)
  });
}

