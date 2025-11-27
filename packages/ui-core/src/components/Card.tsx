'use client';

import { forwardRef } from 'react';
import { Card as TamaguiCard, styled } from 'tamagui';
import type { CardProps as TamaguiCardProps } from 'tamagui';
import type { GestureResponderEvent } from 'react-native';
import { resolvePressEvents } from '../utils/pressable';

export interface CardProps extends Omit<TamaguiCardProps, 'onPress'> {
  variant?: 'default' | 'elevated' | 'outlined';
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  onClick?: (event: React.MouseEvent) => void;
  onPress?: (event: GestureResponderEvent) => void;
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
  const { onDragOver, onDragLeave, onDrop, onClick, onPress, asChild, ...rest } = props;
  
  // When asChild is used, don't add any event handlers - let the child handle them
  // This prevents onPress from leaking to DOM elements when asChild is used
  const pressEvents = asChild ? {} : resolvePressEvents({ onPress, onClick });
  
  // Filter out onPress from rest to prevent it from leaking to DOM elements
  // This is critical when using asChild, as props get merged onto child elements
  const safeRest = Object.fromEntries(
    Object.entries(rest).filter(([key]) => key !== 'onPress' && key !== 'asChild')
  ) as typeof rest;
  
  // Build props object
  const cardProps = {
    ...(onDragOver ? { onDragOver } : {}),
    ...(onDragLeave ? { onDragLeave } : {}),
    ...(onDrop ? { onDrop } : {}),
    ...pressEvents,
    ...safeRest,
    ...(asChild ? { asChild } : {}),
  };
  
  // Ensure onPress is never passed to the DOM, especially when asChild is used
  // Tamagui's Card might internally accept onPress, but we don't want it in the DOM
  const cleanProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cardProps)) {
    // Explicitly exclude onPress from being passed, especially when asChild is used
    if (key !== 'onPress') {
      cleanProps[key] = value;
    }
  }
  
  return (
    <StyledCard
      ref={ref}
      {...cleanProps}
    />
  );
});

