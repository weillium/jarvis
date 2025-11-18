'use client';

import { Card as TamaguiCard, styled } from 'tamagui';
import type { CardProps as TamaguiCardProps } from 'tamagui';

export interface CardProps extends TamaguiCardProps {
  variant?: 'default' | 'elevated' | 'outlined';
}

export const Card = styled(TamaguiCard, {
  name: 'Card',
  backgroundColor: '$background',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$6',
  variants: {
    variant: {
      default: {
        backgroundColor: '$background',
        borderWidth: 1,
        borderColor: '$borderColor',
      },
      elevated: {
        backgroundColor: '$background',
        borderWidth: 0,
        shadowColor: '$color',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
      },
      outlined: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '$borderColor',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'default',
  },
});

