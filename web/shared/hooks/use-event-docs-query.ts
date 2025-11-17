import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase/client';
import type { EventDoc } from '@/shared/types/event-doc';

/**
 * React Query hook for fetching event documents
 * 
 * @param eventId - The event ID to fetch documents for
 * @returns Event documents, loading state, error, and refetch function
 */
export function useEventDocsQuery(eventId: string | null) {
  return useQuery<EventDoc[]>({
    queryKey: ['event-docs', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const { data, error } = await supabase
        .from('event_docs')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw new Error(error.message || 'Failed to fetch event documents');
      }
      
      return data || [];
    },
    enabled: !!eventId,
    staleTime: 30000, // 30 seconds
  });
}

