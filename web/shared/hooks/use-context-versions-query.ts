import { useQuery } from '@tanstack/react-query';

/**
 * React Query hook for context generation cycles/versions
 * 
 * @param eventId - The event ID to fetch versions for
 * @returns Generation cycles array, loading state, error, and refetch function
 */
export function useContextVersionsQuery(eventId: string | null) {
  return useQuery({
    queryKey: ['context-versions', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/context/${eventId}/versions`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch context versions');
      }
      
      return data.cycles || [];
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 2, // 2 minutes - version history changes infrequently
  });
}

