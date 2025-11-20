'use client';

import type { ReactNode } from 'react';
import { YStack, type StackProps } from 'tamagui';
import { Body, Heading } from './Typography';
import { Skeleton } from './Skeleton';

export interface LoadingStateProps extends StackProps {
  title?: string;
  description?: string;
  skeletons?: { width?: number | string; height?: number | string; shape?: 'default' | 'circle' }[];
  icon?: ReactNode;
  align?: 'start' | 'center';
}

export function LoadingState({
  title = 'Loading…',
  description,
  skeletons,
  icon,
  align = 'center',
  ...stackProps
}: LoadingStateProps) {
  const alignment = align === 'center' ? 'center' : 'flex-start';

  return (
    <YStack alignItems={alignment} gap="$3" {...stackProps}>
      {icon}
      <Heading level={4} align={align === 'center' ? 'center' : 'left'}>{title}</Heading>
      {description ? (
        <Body tone="muted" align={align === 'center' ? 'center' : 'left'}>
          {description}
        </Body>
      ) : null}
      {skeletons ? (
        <YStack width="100%" gap="$2">
          {skeletons.map((skeleton, index) => (
            <Skeleton key={index} width={skeleton.width ?? '100%'} height={skeleton.height ?? '$3'} shape={skeleton.shape} />
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}

