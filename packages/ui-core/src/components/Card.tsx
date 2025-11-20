'use client';

import { forwardRef } from 'react';
import { Card as TamaguiCard, styled } from 'tamagui';
import type { CardProps as TamaguiCardProps } from 'tamagui';

export interface CardProps extends TamaguiCardProps {
  variant?: 'default' | 'elevated' | 'outlined';
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  onClick?: (event: React.MouseEvent) => void;
}

const StyledCard = styled(TamaguiCard, {
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

export const Card = forwardRef<any, CardProps>(function Card(props, ref) {
  const { onDragOver, onDragLeave, onDrop, onClick, ...rest } = props;
  return (
    <StyledCard
      ref={ref}
      {...(onDragOver ? { onDragOver } : {})}
      {...(onDragLeave ? { onDragLeave } : {})}
      {...(onDrop ? { onDrop } : {})}
      {...(onClick ? { onClick } : {})}
      {...rest}
    />
  );
});

