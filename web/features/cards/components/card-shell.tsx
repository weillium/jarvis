'use client';

import type { ReactNode } from 'react';
import { YStack, Card } from '@jarvis/ui-core';

interface CardShellProps {
  children: ReactNode;
  allowShrink?: boolean;
}

export function CardShell({ children, allowShrink = false }: CardShellProps) {
  return (
    <YStack
      data-card-shell
      flexShrink={allowShrink ? 1 : 0}
      width={360}
      maxWidth={allowShrink ? '100%' : 'min(360px, calc(100vw - 120px))'}
      style={{ scrollSnapAlign: 'center' }}
    >
      <Card
        variant="elevated"
        padding="$6"
        borderRadius="$6"
        height={504}
        shadowColor="$gray10"
        shadowOffset={{ width: 0, height: 18 }}
        shadowOpacity={0.15}
        shadowRadius={40}
        backgroundColor="$background"
        transition="transform 0.3s ease, box-shadow 0.3s ease"
        hoverStyle={{
          transform: 'translateY(-10px)',
          shadowColor: '$gray10',
          shadowOffset: { width: 0, height: 24 },
          shadowOpacity: 0.2,
          shadowRadius: 30,
        }}
      >
        <YStack gap="$4" height="100%">
          {children}
        </YStack>
      </Card>
    </YStack>
  );
}
