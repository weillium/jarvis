import { useState, useEffect, useCallback } from 'react';
import { Agent } from '@/shared/types/agent';

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
 * Hook to fetch and poll agent information including context statistics
 * 
 * @param eventId - The event ID to fetch agent info for
 * @param pollInterval - Polling interval in milliseconds (default: 3000)
 * @returns Agent info, context stats, blueprint info, loading state, error, and refetch function
 */
export function useAgentInfo(
  eventId: string | null,
  pollInterval: number = 3000
): UseAgentInfoResult {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [contextStats, setContextStats] = useState<ContextStats | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgentInfo = useCallback(async () => {
    if (!eventId) {
      setAgent(null);
      setContextStats(null);
      setBlueprint(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/agent/${eventId}`);
      const data = await res.json();

      if (data.ok) {
        setAgent(data.agent);
        setContextStats(data.contextStats);
        setBlueprint(data.blueprint);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch agent information');
      }
    } catch (err: any) {
      console.error('Failed to fetch agent info:', err);
      setError(err.message || 'Failed to fetch agent information');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchAgentInfo();

    // Set up polling
    const interval = setInterval(() => {
      fetchAgentInfo();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [eventId, pollInterval, fetchAgentInfo]);

  return {
    agent,
    contextStats,
    blueprint,
    loading,
    error,
    refetch: fetchAgentInfo,
  };
}
