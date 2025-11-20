'use client';

import { ReactNode } from 'react';
import { XStack, YStack, styled, type StackProps } from 'tamagui';
import { Heading, Label, Caption } from './Typography';

export const StatGroup = styled(XStack, {
  name: 'StatGroup',
  flexWrap: 'wrap',
  gap: '$4',
  width: '100%',
});

const StatContainer = styled(YStack, {
  name: 'StatItem',
  gap: '$2',
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
  const headingLevel = size === 'lg' ? 2 : size === 'sm' ? 4 : 3;

  return (
    <StatContainer {...props}>
      <Label size="xs" tone="muted">
        {label}
      </Label>
      <Heading level={headingLevel}>{value}</Heading>
      {helperText ? <Caption>{helperText}</Caption> : null}
    </StatContainer>
  );
}
