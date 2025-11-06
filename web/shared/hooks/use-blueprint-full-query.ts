import { useQuery } from '@tanstack/react-query';

export interface BlueprintFull {
  id: string;
  status: string;
  blueprint: any;
  important_details: string[] | null;
  inferred_topics: string[] | null;
  key_terms: string[] | null;
  research_plan: any;
  glossary_plan: any;
  chunks_plan: any;
  target_chunk_count: number | null;
  quality_tier: string | null;
  estimated_cost: number | null;
  created_at: string;
  approved_at: string | null;
}

export interface BlueprintFullResponse {
  ok: boolean;
  blueprint: BlueprintFull | null;
  message?: string;
  error?: string;
}

/**
 * React Query hook for full blueprint data (including blueprint JSON)
 * Used by BlueprintDisplay component
 * 
 * @param eventId - The event ID to fetch blueprint for
 * @returns Full blueprint data, loading state, error, and refetch function
 */
export function useBlueprintFullQuery(eventId: string | null) {
  return useQuery<BlueprintFull | null>({
    queryKey: ['blueprint-full', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/context/${eventId}/blueprint`);
      const data: BlueprintFullResponse = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch blueprint');
      }
      
      return data.blueprint || null;
    },
    enabled: !!eventId,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 3000, // Poll every 3 seconds (to auto-populate when generated)
  });
}

