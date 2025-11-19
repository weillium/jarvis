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
      style={{
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        transform: 'translateY(0)',
        boxShadow: '0 0 0 rgba(15, 23, 42, 0)',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-10px)';
        event.currentTarget.style.boxShadow = '0 24px 50px rgba(15, 23, 42, 0.18)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)';
        event.currentTarget.style.boxShadow = '0 0 0 rgba(15, 23, 42, 0)';
      }}
    >
      <Card
        variant="elevated"
        padding="$6"
        borderRadius="$6"
        minHeight={420}
        style={{
          background: 'linear-gradient(160deg, #ffffff 0%, #f8fafc 60%, #eef2ff 100%)',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.15)',
        }}
      >
        <YStack gap="$4">
          {children}
        </YStack>
      </Card>
    </YStack>
  );
}


