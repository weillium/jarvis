'use client';

import { useQuery } from '@tanstack/react-query';
import { useVisibilityRefetchInterval } from '@/shared/hooks/use-visibility-refetch-interval';

export interface AgentSessionMetadata {
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  model?: string;
  connection_count: number;
  last_connected_at: string | null;
}

export interface TokenMetrics {
  total_tokens: number;
  request_count: number;
  max_tokens: number;
  avg_tokens: number;
  warnings: number;
  criticals: number;
  last_request?: {
    tokens: number;
    percentage: number;
    breakdown: Record<string, number>;
    timestamp: string;
  };
}

export interface RuntimeStats {
  transcript_last_seq?: number;
  cards_last_seq: number;
  facts_last_seq: number;
  facts_last_update: string;
  ring_buffer_stats: {
    total: number;
    finalized: number;
    oldest: number | null;
    newest: number | null;
  };
  facts_store_stats: {
    total: number;
    maxItems: number;
    capacityUsed: string;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    evictions: number;
  };
}

export interface AgentSession {
  agent_type: 'transcript' | 'cards' | 'facts';
  session_id: string;
  status: 'active' | 'paused' | 'closed' | 'error';
  metadata: AgentSessionMetadata;
  token_metrics?: TokenMetrics;
  runtime_stats?: RuntimeStats;
  metrics_recorded_at?: string;
}

export interface AgentSessionsResponse {
  ok: boolean;
  hasSessions: boolean;
  hasActiveSessions: boolean;
  sessionCount: number;
  activeSessionCount: number;
  sessions: AgentSession[];
}

/**
 * React Query hook for agent sessions status
 * Used by AgentOverview component for polling session status
 * 
 * @param eventId - The event ID to check sessions for
 * @returns Session status data, loading state, error, and refetch function
 */
export function useAgentSessionsQuery(eventId: string | null) {
  const refetchInterval = useVisibilityRefetchInterval(5000);

  return useQuery<AgentSessionsResponse>({
    queryKey: ['agent-sessions', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      console.log(`[useAgentSessionsQuery] Fetching sessions for event: ${eventId}`);
      const res = await fetch(`/api/agent-sessions/${eventId}/check`);
      
      // Check if response is ok before parsing
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[useAgentSessionsQuery] HTTP ${res.status} error:`, errorText);
        throw new Error(`HTTP ${res.status}: Failed to check agent sessions`);
      }
      
      const data = await res.json();
      console.log(`[useAgentSessionsQuery] Received response:`, {
        ok: data.ok,
        hasSessions: data.hasSessions,
        sessionCount: data.sessionCount,
        sessionsLength: data.sessions?.length || 0,
      });
      
      if (!data.ok) {
        console.error(`[useAgentSessionsQuery] API returned error:`, data.error);
        throw new Error(data.error || 'Failed to check agent sessions');
      }
      
      // Validate response structure
      if (!data.sessions || !Array.isArray(data.sessions)) {
        console.error(`[useAgentSessionsQuery] Invalid response structure - sessions is not an array:`, data);
        // Return empty array instead of throwing to prevent infinite retries
        return {
          ...data,
          sessions: [],
        };
      }
      
      console.log(`[useAgentSessionsQuery] Returning ${data.sessions.length} sessions`);
      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    gcTime: 1000 * 60,
    retry: 1, // Only retry once on failure (don't retry indefinitely)
    retryDelay: 1000, // Wait 1 second before retry
  });
}

