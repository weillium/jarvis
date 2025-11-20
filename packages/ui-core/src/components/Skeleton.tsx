'use client';

import { styled, YStack, type StackProps } from 'tamagui';

export const Skeleton = styled<StackProps>(YStack, {
  name: 'Skeleton',
  backgroundColor: '$gray3',
  borderRadius: '$2',
  width: '100%',
  height: '$3',
  opacity: 0.6,
  variants: {
    shape: {
      default: {},
      circle: {
        borderRadius: '$10',
      },
    },
  } as const,
  defaultVariants: {
    shape: 'default',
  },
});
