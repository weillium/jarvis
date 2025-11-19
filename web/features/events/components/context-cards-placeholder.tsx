'use client';

import { EmptyStateCard } from '@jarvis/ui-core';

export function ContextCardsPlaceholder() {
  return (
    <EmptyStateCard
      title="Live Context Cards Feed"
      description="Context cards will appear here in real-time during the event"
      icon={
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      }
    />
  );
}
