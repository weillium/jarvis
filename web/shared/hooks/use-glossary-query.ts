import { useQuery } from '@tanstack/react-query';

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  acronym_for: string | null;
  category: string | null;
  usage_examples: string[] | null;
  related_terms: string[] | null;
  confidence_score: number | null;
  source: string | null;
  source_url: string | null;
  created_at: string;
  generation_cycle_id: string | null;
}

export interface GlossaryData {
  ok: boolean;
  terms: GlossaryTerm[];
  count: number;
  grouped_by_category: Record<string, GlossaryTerm[]>;
}

export interface UseGlossaryQueryOptions {
  category?: string | null;
  search?: string | null;
}

/**
 * React Query hook for glossary terms
 * Used by GlossaryVisualization component
 * 
 * @param eventId - The event ID to fetch glossary for
 * @param options - Optional filters (category, search)
 * @returns Glossary data, loading state, error, and refetch function
 */
export function useGlossaryQuery(
  eventId: string | null,
  options?: UseGlossaryQueryOptions
) {
  const { category, search } = options || {};
  
  return useQuery<GlossaryData>({
    queryKey: ['glossary', eventId, category, search],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const params = new URLSearchParams();
      if (category) {
        params.append('category', category);
      }
      if (search) {
        params.append('search', search);
      }
      
      const res = await fetch(`/api/context/${eventId}/glossary?${params.toString()}`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch glossary');
      }
      
      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60, // 1 minute (glossary terms change infrequently)
  });
}

