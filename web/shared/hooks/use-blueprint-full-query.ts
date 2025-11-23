'use client';

import { useQuery } from '@tanstack/react-query';
import { useVisibilityRefetchInterval } from '@/shared/hooks/use-visibility-refetch-interval';

export type BlueprintResearchAPI = 'exa' | 'wikipedia';
export type BlueprintPurpose = 'facts' | 'cards' | 'glossary';
export type BlueprintAgentType = 'facts' | 'cards';

export interface BlueprintResearchQuery {
  query: string;
  api: BlueprintResearchAPI;
  priority: number;
  estimated_cost?: number;
  purpose?: BlueprintPurpose[];
  provenance_hint?: string;
  agent_utility?: BlueprintAgentType[];
}

export interface BlueprintResearchPlan {
  queries: BlueprintResearchQuery[];
  total_searches: number;
  estimated_total_cost: number;
}

export interface BlueprintGlossaryTermPlan {
  term: string;
  is_acronym: boolean;
  category: string;
  priority: number;
  agent_utility?: BlueprintAgentType[];
}

export interface BlueprintGlossaryPlan {
  terms: BlueprintGlossaryTermPlan[];
  estimated_count: number;
}

export interface BlueprintChunkSourcePlan {
  label: string;
  upstream_reference: string;
  expected_format: string;
  priority: number;
  estimated_chunks: number;
  agent_utility: BlueprintAgentType[];
}

export interface BlueprintChunksPlan {
  sources: BlueprintChunkSourcePlan[];
  target_count: number;
  quality_tier: 'basic' | 'comprehensive';
  ranking_strategy: string;
}

export interface BlueprintCostBreakdown {
  research: number;
  glossary: number;
  chunks: number;
  total: number;
}

export interface BlueprintAgentAlignment {
  facts?: {
    highlights?: string[];
    open_questions?: string[];
  };
  cards?: {
    assets?: string[];
    open_questions?: string[];
  };
}

export interface BlueprintFull {
  id: string;
  status: string;
  blueprint: Record<string, unknown> | null;
  important_details: string[] | null;
  inferred_topics: string[] | null;
  key_terms: string[] | null;
  research_plan: BlueprintResearchPlan | null;
  glossary_plan: BlueprintGlossaryPlan | null;
  chunks_plan: BlueprintChunksPlan | null;
  cost_breakdown: BlueprintCostBreakdown | null;
  agent_alignment: BlueprintAgentAlignment | null;
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
  const refetchInterval = useVisibilityRefetchInterval(3000);

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
      
      return (data.blueprint ?? null) as BlueprintFull | null;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 5, // 5 minutes - blueprints change infrequently
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    gcTime: 1000 * 60 * 10, // Allow 10 minutes of cache for blueprint payloads
  });
}

