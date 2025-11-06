import { useQuery } from '@tanstack/react-query';

export interface ResearchResult {
  id: string;
  query: string;
  api: string;
  content: string;
  source_url: string | null;
  quality_score: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  generation_cycle_id: string | null;
}

export interface ResearchData {
  ok: boolean;
  results: ResearchResult[];
  count: number;
  byApi: Record<string, number>;
  avgQualityScore: number;
}

/**
 * React Query hook for research results
 * Used by ResearchResultsVisualization component
 * 
 * @param eventId - The event ID to fetch research results for
 * @returns Research data, loading state, error, and refetch function
 */
export function useResearchQuery(eventId: string | null) {
  return useQuery<ResearchData>({
    queryKey: ['research', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/context/${eventId}/research`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch research results');
      }
      
      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60, // 1 minute (research results change infrequently)
  });
}

