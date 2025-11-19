'use client';

import { keyframes, styled, YStack, type StackProps } from 'tamagui';

const pulse = keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.4 },
  '100%': { opacity: 1 },
});

export const Skeleton = styled<StackProps>(YStack, {
  name: 'Skeleton',
  backgroundColor: '$gray3',
  borderRadius: '$2',
  width: '100%',
  height: '$3',
  animationName: pulse,
  animationDuration: '1.5s',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'ease-in-out',
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
