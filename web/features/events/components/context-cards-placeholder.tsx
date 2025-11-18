'use client';

import { YStack, Text, Card } from '@jarvis/ui-core';

export function ContextCardsPlaceholder() {
  return (
    <Card paddingVertical="$12" paddingHorizontal="$6" alignItems="center">
      <YStack alignItems="center" gap="$4">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: '#cbd5e1' }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        <Text fontSize="$5" fontWeight="600" color="$gray9" margin={0}>
          Live Context Cards Feed
        </Text>
        <Text fontSize="$3" color="$gray11" margin={0}>
          Context cards will appear here in real-time during the event
        </Text>
      </YStack>
    </Card>
  );
}

