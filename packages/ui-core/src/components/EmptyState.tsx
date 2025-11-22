'use client';

import type { ReactNode } from 'react';
import { YStack } from 'tamagui';
import { Card, type CardProps } from './Card';
import { Heading, Body } from './Typography';

export interface EmptyStateCardProps extends CardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
  titleLevel?: 3 | 4 | 5;
}

export function EmptyStateCard({
  title,
  description,
  icon,
  actions,
  align = 'center',
  titleLevel = 4,
  padding = '$16 $8',
  ...cardProps
}: EmptyStateCardProps) {
  const alignment = align === 'center' ? 'center' : 'flex-start';
  const textAlign = align === 'center' ? 'center' : 'left';

  return (
    <Card padding={padding} alignItems={alignment} {...cardProps}>
      <YStack alignItems={alignment} gap="$6">
        {icon ? <YStack>{icon}</YStack> : null}
        <YStack alignItems={alignment} gap="$2">
          <Heading level={titleLevel} align={textAlign}>
            {title}
          </Heading>
          {description ? (
            <Body tone="muted" align={textAlign}>
              {description}
            </Body>
          ) : null}
        </YStack>
        {actions}
      </YStack>
    </Card>
  );
}
