'use client';

import { isRecord, formatCurrency } from './blueprint-display-utils';
import { YStack, Card, Heading, StatGroup, StatItem } from '@jarvis/ui-core';

interface CostBreakdownSectionProps {
  costBreakdown: Record<string, unknown> | null;
}

export function CostBreakdownSection({ costBreakdown }: CostBreakdownSectionProps) {
  if (!isRecord(costBreakdown)) {
    return null;
  }

  return (
    <YStack gap="$3">
      <Heading level={4}>Cost Breakdown</Heading>
      <Card variant="outlined" padding="$4" gap="$3">
        <StatGroup>
          {['research', 'glossary', 'chunks', 'total'].map((key) => (
            <StatItem
              key={key}
              label={key === 'total' ? 'Total' : `${key.charAt(0).toUpperCase()}${key.slice(1)}`}
              value={
                typeof costBreakdown[key] === 'number'
                  ? formatCurrency(costBreakdown[key] as number)
                  : '—'
              }
              size="sm"
            />
          ))}
        </StatGroup>
      </Card>
    </YStack>
  );
}
