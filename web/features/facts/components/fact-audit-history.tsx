'use client';

import type { FactAuditLogEntry } from '@/shared/types/fact';
import { YStack, Alert, BulletList, Body, EmptyStateCard, LoadingState } from '@jarvis/ui-core';

interface FactAuditHistoryProps {
  entries: FactAuditLogEntry[];
  isLoading: boolean;
  error: string | null;
}

export function FactAuditHistory({ entries, isLoading, error }: FactAuditHistoryProps) {
  if (isLoading) {
    return (
      <LoadingState
        title="Loading history"
        description="Fetching moderation events for this fact."
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
        description="Actions will appear here once the fact has been reviewed."
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

