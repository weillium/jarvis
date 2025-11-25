import { useQuery } from '@tanstack/react-query';
import type { Card } from '@/shared/types/card';

interface CardsResponse {
  ok: boolean;
  cards: Card[];
  error?: string;
}

export function useCardsQuery(eventId: string | null) {
  return useQuery<Card[]>({
    queryKey: ['cards', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID required');
      }

      const response = await fetch(`/api/cards/${eventId}`);
      const data: CardsResponse = await response.json();

      if (!response.ok || !data.ok) {
        console.error('[useCardsQuery] Failed to fetch cards:', data.error);
        throw new Error(data.error ?? 'Failed to fetch cards');
      }

      console.log(`[useCardsQuery] Fetched ${data.cards?.length ?? 0} cards for event ${eventId}`);
      return data.cards ?? [];
    },
    enabled: !!eventId,
    staleTime: 1000 * 30, // 30 seconds - cards are updated via SSE, so less frequent refetching is needed
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus - SSE handles real-time updates
    refetchOnMount: true, // Refetch on mount to ensure we get latest cards from DB
  });
}

