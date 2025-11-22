'use client';

import { ReactNode } from 'react';
import { XStack, YStack, styled, type StackProps } from 'tamagui';
import { Body, Label, Caption } from './Typography';

export const StatGroup = styled(XStack, {
  name: 'StatGroup',
  flexWrap: 'wrap',
  gap: '$4',
  width: '100%',
});

const StatContainer = styled(YStack, {
  name: 'StatItem',
  minWidth: 180,
});

interface StatItemProps extends StackProps {
  label: string;
  value: ReactNode;
  helperText?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function StatItem({
  label,
  value,
  helperText,
  size = 'md',
  ...props
}: StatItemProps) {
  return (
    <StatContainer {...props}>
      <Label size="xs" tone="muted">
        {label}
      </Label>
      <YStack gap="$0.25" marginTop="$1">
        <Body size={size}>{value}</Body>
        {helperText ? <Caption>{helperText}</Caption> : null}
      </YStack>
    </StatContainer>
  );
}
