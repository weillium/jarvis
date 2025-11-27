import { useQuery } from '@tanstack/react-query';
import type { FactAuditLogEntry } from '@/shared/types/fact';

interface AuditLogResponse {
  ok: boolean;
  entries?: FactAuditLogEntry[];
  error?: string;
}

export function useFactAuditLog(eventId: string, factKey: string, enabled: boolean) {
  return useQuery<FactAuditLogEntry[]>({
    queryKey: ['fact-audit-log', eventId, factKey],
    enabled: enabled && Boolean(eventId) && Boolean(factKey),
    queryFn: async () => {
      const response = await fetch(`/api/facts/${eventId}/audit?factKey=${encodeURIComponent(factKey)}`);
      const data: AuditLogResponse = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Failed to fetch fact audit log');
      }

      return data.entries ?? [];
    },
    staleTime: 1000 * 15,
  });
}

