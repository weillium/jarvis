'use client';

import type { ReactNode } from 'react';
import { YStack, Card } from '@jarvis/ui-core';

interface CardShellProps {
  children: ReactNode;
}

export function CardShell({ children }: CardShellProps) {
  return (
    <YStack
      data-card-shell
      flexShrink={0}
      width={360}
      maxWidth="min(360px, calc(100vw - 120px))"
      scrollSnapAlign="center"
      transition="transform 0.3s ease, box-shadow 0.3s ease"
      shadowColor="transparent"
      hoverStyle={{
        transform: 'translateY(-10px)',
        shadowColor: '$gray10',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
      }}
    >
      <Card
        variant="elevated"
        padding="$6"
        borderRadius="$6"
        minHeight={420}
        shadowColor="$gray10"
        shadowOffset={{ width: 0, height: 18 }}
        shadowOpacity={0.15}
        shadowRadius={40}
        backgroundColor="$background"
      >
        <YStack gap="$4">
          {children}
        </YStack>
      </Card>
    </YStack>
  );
}
