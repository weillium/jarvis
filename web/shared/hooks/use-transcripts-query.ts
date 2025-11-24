'use client';

import { useQuery } from '@tanstack/react-query';
import { useVisibilityRefetchInterval } from '@/shared/hooks/use-visibility-refetch-interval';

export interface Transcript {
  id: number;
  seq: number;
  at_ms: number;
  speaker: string | null;
  text: string;
  final: boolean;
  ts: string;
}

export interface TranscriptsResponse {
  ok: boolean;
  transcripts: Transcript[];
  count: number;
  event_id: string;
}

/**
 * React Query hook for fetching recent transcripts (ring buffer equivalent)
 * Polls every 5 seconds to get real-time updates (SSE also provides updates)
 */
export function useTranscriptsQuery(eventId: string | null) {
  const refetchInterval = useVisibilityRefetchInterval(5000); // Increase to 5 seconds - SSE handles real-time updates

  return useQuery<TranscriptsResponse>({
    queryKey: ['transcripts', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }

      const res = await fetch(`/api/transcripts/${eventId}?limit=150&max_age_minutes=5`);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: Failed to fetch transcripts`);
      }

      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch transcripts');
      }

      return data;
    },
    enabled: !!eventId,
    staleTime: 1000 * 10, // 10 seconds - transcripts are updated via SSE, so less frequent refetching is needed
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false, // Don't refetch on focus - SSE handles real-time updates
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
    retry: 1,
    retryDelay: 1000,
  });
}

