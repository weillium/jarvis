import { useQuery } from '@tanstack/react-query';

export interface AgentSessionMetadata {
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  model?: string;
}

export interface AgentSession {
  agent_type: 'cards' | 'facts';
  session_id: string;
  status: 'active' | 'paused' | 'closed' | 'error';
  metadata: AgentSessionMetadata;
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
  return useQuery<AgentSessionsResponse>({
    queryKey: ['agent-sessions', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/agent-sessions/${eventId}/check`);
      
      // Check if response is ok before parsing
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to check agent sessions`);
      }
      
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to check agent sessions');
      }
      
      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: 5000, // Poll every 5 seconds (to detect session status changes)
    retry: 1, // Only retry once on failure (don't retry indefinitely)
    retryDelay: 1000, // Wait 1 second before retry
  });
}

