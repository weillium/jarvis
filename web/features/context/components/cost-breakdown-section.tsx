'use client';

import { isRecord, formatCurrency } from './blueprint-display-utils';
import { YStack, XStack, Text } from '@jarvis/ui-core';

interface CostBreakdownSectionProps {
  costBreakdown: Record<string, unknown> | null;
}

export function CostBreakdownSection({ costBreakdown }: CostBreakdownSectionProps) {
  if (!isRecord(costBreakdown)) {
    return null;
  }

  return (
    <YStack marginBottom="$5">
      <Text fontSize="$3" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
        Cost Breakdown
      </Text>
      <XStack flexWrap="wrap" gap="$3" fontSize="$2" color="$gray9">
        {['research', 'glossary', 'chunks', 'total'].map((key) => (
          <YStack key={key} minWidth={140}>
            <Text
              textTransform="capitalize"
              color="$gray11"
              marginBottom="$0.5"
              margin={0}
            >
              {key === 'total' ? 'Total' : `${key.charAt(0).toUpperCase()}${key.slice(1)}`}
            </Text>
            <Text fontWeight="600" color="$color" margin={0}>
              {typeof costBreakdown[key] === 'number'
                ? formatCurrency(costBreakdown[key] as number)
                : '—'}
            </Text>
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}

