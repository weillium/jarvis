'use client';

import { useQuery } from '@tanstack/react-query';

export interface ApiFact {
  fact_key: string;
  fact_value: any;
  confidence: number;
  last_seen_seq: number;
  updated_at: string;
}

export interface FactsResponse {
  ok: boolean;
  facts?: ApiFact[];
  error?: string;
}

/**
 * React Query hook for fetching facts
 * Replaces useEffect-based fetching with proper caching and deduplication
 */
export function useFactsQuery(eventId: string | null) {
  return useQuery<ApiFact[]>({
    queryKey: ['facts', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }

      const response = await fetch(`/api/context/${eventId}/facts`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to load facts (status ${response.status})`);
      }

      const data: FactsResponse = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to load facts');
      }

      return data.facts ?? [];
    },
    enabled: !!eventId,
    staleTime: 1000 * 30, // 30 seconds - facts are updated via SSE, so less frequent refetching is needed
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus - SSE handles real-time updates
    refetchOnMount: false, // Don't refetch on mount if data is fresh
  });
}

