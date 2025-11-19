'use client';

import type { CardAuditLogEntry } from '@/shared/types/card';
import { YStack, Text, Alert } from '@jarvis/ui-core';

interface CardAuditHistoryProps {
  entries: CardAuditLogEntry[];
  isLoading: boolean;
  error: string | null;
}

export function CardAuditHistory({ entries, isLoading, error }: CardAuditHistoryProps) {
  if (isLoading) {
    return (
      <Text fontSize="$2" color="$gray11" padding="$2 0" margin={0}>
        Loading history…
      </Text>
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <Text fontSize="$2" margin={0}>{error}</Text>
      </Alert>
    );
  }

  if (!entries.length) {
    return (
      <Text fontSize="$2" color="$gray11" padding="$2 0" margin={0}>
        No moderation history yet.
      </Text>
    );
  }

  return (
    <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {entries.map((entry) => (
        <li key={entry.id} style={{ fontSize: '12px', lineHeight: 1.4 }}>
          <YStack gap="$1">
            <Text fontSize="$2" color="$gray9" margin={0}>
              <Text fontWeight="600" margin={0}>{entry.action}</Text> · {new Date(entry.created_at).toLocaleString()}
            </Text>
            {entry.reason && (
              <Text fontSize="$2" color="$gray8" margin={0}>
                Reason: {entry.reason}
              </Text>
            )}
          </YStack>
        </li>
      ))}
    </ul>
  );
}





