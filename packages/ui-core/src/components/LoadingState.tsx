'use client';

import type { ReactNode } from 'react';
import { YStack } from 'tamagui';
import { Card, type CardProps } from './Card';
import { Body, Heading } from './Typography';
import { Skeleton } from './Skeleton';

export interface LoadingStateProps extends CardProps {
  title?: string;
  description?: string;
  skeletons?: { width?: number | string; height?: number | string; shape?: 'default' | 'circle' }[];
  icon?: ReactNode;
  align?: 'start' | 'center';
  titleLevel?: 3 | 4 | 5;
}

export function LoadingState({
  title = 'Loading…',
  description,
  skeletons,
  icon,
  align = 'center',
  titleLevel = 5,
  padding = '$16 $8',
  ...cardProps
}: LoadingStateProps) {
  const alignment = align === 'center' ? 'center' : 'flex-start';
  const textAlign = align === 'center' ? 'center' : 'left';

  return (
    <YStack>
      <Card padding={padding} alignItems={alignment} {...cardProps}>
        <YStack alignItems={alignment} gap="$6" padding="$6">
          {icon ? <YStack>{icon}</YStack> : null}
          <YStack alignItems={alignment} gap="$2">
            <Heading level={titleLevel} align={textAlign}>
              {title}
            </Heading>
            {description ? (
              <Body size="sm" tone="muted" align={textAlign}>
                {description}
              </Body>
            ) : null}
          </YStack>
          {skeletons ? (
            <YStack width="100%" gap="$2">
              {skeletons.map((skeleton, index) => (
                <Skeleton key={index} width={skeleton.width ?? '100%'} height={skeleton.height ?? '$3'} shape={skeleton.shape} />
              ))}
            </YStack>
          ) : null}
        </YStack>
      </Card>
    </YStack>
  );
}

