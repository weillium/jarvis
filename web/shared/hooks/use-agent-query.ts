'use client';

import { useQuery } from '@tanstack/react-query';
import { useVisibilityRefetchInterval } from '@/shared/hooks/use-visibility-refetch-interval';
import type { Agent } from '@/shared/types/agent';

export interface AgentInfo {
  id: string;
  event_id: string;
  status: Agent['status'];
  stage: string | null;
  model: string;
  model_set: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContextStats {
  chunkCount: number;
  glossaryTermCount: number;
}

export interface BlueprintInfo {
  id: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  target_chunk_count: number | null;
  estimated_cost: number | null;
  quality_tier: string | null;
}

export interface AgentData {
  agent: AgentInfo;
  contextStats: ContextStats | null;
  blueprint: BlueprintInfo | null;
}

/**
 * React Query hook for agent information
 * Replaces useAgentInfo with automatic caching and deduplication
 * 
 * @param eventId - The event ID to fetch agent info for
 * @returns Agent data, loading state, error, and refetch function
 */
export function useAgentQuery(eventId: string | null) {
  const refetchInterval = useVisibilityRefetchInterval(10000); // Increase to 10 seconds

  return useQuery<AgentData>({
    queryKey: ['agent', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/agent/${eventId}`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch agent information');
      }
      
      return {
        agent: data.agent,
        contextStats: data.contextStats || null,
        blueprint: data.blueprint || null,
      };
    },
    enabled: !!eventId,
    staleTime: 1000 * 30, // 30 seconds - agent status doesn't change that frequently
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false, // Don't refetch on focus
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });
}

