'use client';

import type { CardAuditLogEntry } from '@/shared/types/card';
import { YStack, Alert, BulletList, Body, EmptyStateCard, LoadingState } from '@jarvis/ui-core';

interface CardAuditHistoryProps {
  entries: CardAuditLogEntry[];
  isLoading: boolean;
  error: string | null;
}

export function CardAuditHistory({ entries, isLoading, error }: CardAuditHistoryProps) {
  if (isLoading) {
    return (
      <LoadingState
        title="Loading history"
        description="Fetching moderation events for this card."
      />
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <Body size="sm">{error}</Body>
      </Alert>
    );
  }

  if (!entries.length) {
    return (
      <EmptyStateCard
        title="No moderation history"
        description="Actions will appear here once the card has been reviewed."
        padding="$3"
        borderRadius="$2"
        borderWidth={1}
        borderColor="$borderColor"
        backgroundColor="$gray1"
        align="start"
        titleLevel={5}
      />
    );
  }

  return (
    <BulletList
      items={entries}
      renderItem={(entry) => (
        <YStack gap="$1">
          <Body size="sm">
            <Body size="sm" weight="bold">
              {entry.action}
            </Body>{' '}
            · {new Date(entry.created_at).toLocaleString()}
          </Body>
          {entry.reason ? (
            <Body size="sm" tone="muted">
              Reason: {entry.reason}
            </Body>
          ) : null}
        </YStack>
      )}
    />
  );
}

