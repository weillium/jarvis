import { useQuery } from '@tanstack/react-query';
import type { CardAuditLogEntry } from '@/shared/types/card';

interface AuditLogResponse {
  ok: boolean;
  entries?: CardAuditLogEntry[];
  error?: string;
}

export function useCardAuditLog(eventId: string, cardId: string, enabled: boolean) {
  return useQuery<CardAuditLogEntry[]>({
    queryKey: ['card-audit-log', eventId, cardId],
    enabled: enabled && Boolean(eventId) && Boolean(cardId),
    queryFn: async () => {
      const response = await fetch(`/api/cards/${eventId}/audit?cardId=${encodeURIComponent(cardId)}`);
      const data: AuditLogResponse = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Failed to fetch card audit log');
      }

      return data.entries ?? [];
    },
    staleTime: 1000 * 15,
  });
}



