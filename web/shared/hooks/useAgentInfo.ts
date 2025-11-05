import { Agent } from '@/shared/types/agent';
import { useAgentQuery } from './use-agent-query';

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

export interface AgentInfo {
  id: string;
  event_id: string;
  status: Agent['status'];
  stage: string | null;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface UseAgentInfoResult {
  agent: AgentInfo | null;
  contextStats: ContextStats | null;
  blueprint: BlueprintInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * @deprecated Use useAgentQuery instead. This is a compatibility wrapper.
 * 
 * Hook to fetch and poll agent information including context statistics
 * 
 * @param eventId - The event ID to fetch agent info for
 * @param pollInterval - Polling interval in milliseconds (default: 3000) - ignored, uses React Query's refetchInterval
 * @returns Agent info, context stats, blueprint info, loading state, error, and refetch function
 */
export function useAgentInfo(
  eventId: string | null,
  pollInterval: number = 3000
): UseAgentInfoResult {
  const { data, isLoading, error, refetch } = useAgentQuery(eventId);
  
  return {
    agent: data?.agent ?? null,
    contextStats: data?.contextStats ?? null,
    blueprint: data?.blueprint ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch agent information') : null,
    refetch: async () => {
      await refetch();
    },
  };
}
