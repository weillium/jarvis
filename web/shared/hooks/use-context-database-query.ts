import { useQuery } from '@tanstack/react-query';

export interface ContextItem {
  id: string;
  chunk: string;
  metadata: {
    source?: string;
    enrichment_source?: string;
    research_source?: string;
    component_type?: string;
    quality_score?: number | string;
    chunk_size?: number | string;
    enrichment_timestamp?: string;
  } | null;
  rank: number | null;
  generation_cycle_id: string | null;
}

export interface ContextDatabaseResponse {
  data?: ContextItem[];
  error?: string;
}

/**
 * React Query hook for context database items
 * Used by ContextDatabaseVisualization component
 * 
 * @param eventId - The event ID to fetch context items for
 * @returns Context items array, loading state, error, and refetch function
 */
export function useContextDatabaseQuery(eventId: string | null) {
  return useQuery<ContextItem[]>({
    queryKey: ['context-database', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/context/${eventId}`);
      const data: ContextDatabaseResponse = await res.json();
      
      if (data.error) {
        throw new Error(data.error || 'Failed to fetch context database');
      }
      
      return data.data || [];
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 2, // 2 minutes - context items change moderately but not constantly
  });
}

