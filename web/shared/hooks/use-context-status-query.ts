'use client';

import { useQuery } from '@tanstack/react-query';
import { useVisibilityRefetchInterval } from '@/shared/hooks/use-visibility-refetch-interval';

export interface ContextStatusData {
  ok: boolean;
  agent: {
    id: string;
    status: string;
    stage: string | null;
    created_at: string;
  } | null;
  blueprint: {
    id: string;
    status: string;
    created_at: string;
    approved_at: string | null;
    target_chunk_count: number | null;
    estimated_cost: number | null;
  } | null;
  stage: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  hasResearch?: boolean;
  hasGlossary?: boolean;
  hasChunks?: boolean;
}

/**
 * React Query hook for context generation status
 * Used by ContextGenerationPanel for polling status
 * 
 * @param eventId - The event ID to fetch status for
 * @returns Context status data, loading state, error, and refetch function
 */
export function useContextStatusQuery(eventId: string | null) {
  const refetchInterval = useVisibilityRefetchInterval(3000);

  return useQuery<ContextStatusData>({
    queryKey: ['context-status', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/context/${eventId}/status`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch context status');
      }
      
      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 5, // 5 seconds
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    gcTime: 1000 * 60,
  });
}

