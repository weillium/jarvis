import { useQuery } from '@tanstack/react-query';
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
    refetchInterval: 3000, // Poll every 3 seconds (same as current behavior)
  });
}

