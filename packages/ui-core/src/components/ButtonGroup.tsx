'use client';

import type { ReactNode } from 'react';
import { XStack, YStack, type StackProps } from 'tamagui';

export interface ButtonGroupProps extends StackProps {
  orientation?: 'horizontal' | 'vertical';
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  gap?: StackProps['gap'];
  children: ReactNode;
}

const alignMap: Record<NonNullable<ButtonGroupProps['align']>, StackProps['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export function ButtonGroup({
  orientation = 'horizontal',
  align = 'end',
  wrap = true,
  gap = '$3',
  children,
  ...stackProps
}: ButtonGroupProps) {
  const Container = orientation === 'horizontal' ? XStack : YStack;

  return (
    <Container
      gap={gap}
      alignItems={alignMap[align]}
      flexWrap={orientation === 'horizontal' && wrap ? 'wrap' : 'nowrap'}
      {...stackProps}
    >
      {children}
    </Container>
  );
}

