'use client';

import { useQuery } from '@tanstack/react-query';
import type { AgentSession } from './use-agent-sessions-query';

export interface AgentSessionHistory extends AgentSession {
  history_id: string;
  agent_id: string;
  agent_session_id: string | null;
  event_type: string;
  history_created_at: string;
  previous_status: string | null;
  new_status: string | null;
}

export interface AgentSessionsHistoryResponse {
  ok: boolean;
  records: AgentSessionHistory[];
}

/**
 * React Query hook for historical agent sessions from agent_sessions_history table
 * 
 * @param eventId - The event ID to fetch historical sessions for
 * @returns Historical session data, loading state, error, and refetch function
 */
export function useAgentSessionsHistoryQuery(eventId: string | null) {
  return useQuery<AgentSessionsHistoryResponse>({
    queryKey: ['agent-sessions-history', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      console.log(`[useAgentSessionsHistoryQuery] Fetching historical sessions for event: ${eventId}`);
      const res = await fetch(`/api/agent-sessions/${eventId}/history`);
      
      // Check if response is ok before parsing
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[useAgentSessionsHistoryQuery] HTTP ${res.status} error:`, errorText);
        throw new Error(`HTTP ${res.status}: Failed to fetch agent session history`);
      }
      
      const data = await res.json();
      console.log(`[useAgentSessionsHistoryQuery] Received response:`, {
        ok: data.ok,
        recordsLength: data.records?.length || 0,
      });
      
      if (!data.ok) {
        console.error(`[useAgentSessionsHistoryQuery] API returned error:`, data.error);
        throw new Error(data.error || 'Failed to fetch agent session history');
      }
      
      // Validate response structure
      if (!data.records || !Array.isArray(data.records)) {
        console.error(`[useAgentSessionsHistoryQuery] Invalid response structure - records is not an array:`, data);
        // Return empty array instead of throwing to prevent infinite retries
        return {
          ...data,
          records: [],
        };
      }
      
      console.log(`[useAgentSessionsHistoryQuery] Returning ${data.records.length} historical records`);
      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 5, // 5 minutes - historical data doesn't change frequently
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
    retry: 1, // Only retry once on failure
    retryDelay: 1000, // Wait 1 second before retry
  });
}

