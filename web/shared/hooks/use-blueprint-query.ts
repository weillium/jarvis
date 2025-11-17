'use client';

import { useQuery } from '@tanstack/react-query';
import { useVisibilityRefetchInterval } from '@/shared/hooks/use-visibility-refetch-interval';

export interface BlueprintData {
  id: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  target_chunk_count: number | null;
  estimated_cost: number | null;
  quality_tier: string | null;
}

/**
 * React Query hook for blueprint status
 * 
 * @param eventId - The event ID to fetch blueprint for
 * @returns Blueprint data, loading state, error, and refetch function
 */
export function useBlueprintQuery(eventId: string | null) {
  const refetchInterval = useVisibilityRefetchInterval(3000);

  return useQuery<BlueprintData | null>({
    queryKey: ['blueprint', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }
      
      const res = await fetch(`/api/context/${eventId}/status`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch blueprint status');
      }
      
      return data.blueprint || null;
    },
    enabled: !!eventId,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    gcTime: 1000 * 120,
  });
}

