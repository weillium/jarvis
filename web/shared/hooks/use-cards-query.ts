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
        throw new Error(data.error ?? 'Failed to fetch cards');
      }

      return data.cards ?? [];
    },
    enabled: !!eventId,
    staleTime: 1000 * 5,
  });
}

