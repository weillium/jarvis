'use client';

import { forwardRef } from 'react';
import { Button as TamaguiButton, styled } from 'tamagui';
import type { ButtonProps as TamaguiButtonProps } from 'tamagui';
import { resolvePressEvents } from '../utils/pressable';

export interface ButtonProps extends Omit<TamaguiButtonProps, 'variant' | 'onPress'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPress?: (event: any) => void;
  type?: 'button' | 'submit' | 'reset';
}

// Base styled component without size variant to avoid passing size to Tamagui
const ButtonFrame = styled(TamaguiButton, {
  name: 'Button',
  fontFamily: '$body',
  borderRadius: '$3',
  fontWeight: '500',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$2',
  // Set default fontSize to prevent auto-resolution issues
  // Use numeric token $4 (14px) instead of '$md' to avoid getFontSize warnings
  fontSize: '$4',
  // minHeight calculated: fontSize 14px * 1.2 lineHeight = 17px + paddingVertical $0.5*2 (4px) = 21px
  minHeight: 21,
  paddingHorizontal: '$4',
  paddingVertical: '$0.5', // Reduced by 25% from $1.5 to $1 (4px)
  pressStyle: {
    scale: 0.98,
    opacity: 0.9,
  },
  disabledStyle: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  variants: {
    variant: {
      primary: {
        backgroundColor: '$blue11',
        color: '$background',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$blue10',
        },
        pressStyle: {
          backgroundColor: '$blue9',
        },
        disabledStyle: {
          backgroundColor: '$gray5',
          color: '$gray11',
        },
      },
      secondary: {
        backgroundColor: '$gray3',
        color: '$color',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$gray4',
        },
        pressStyle: {
          backgroundColor: '$gray5',
        },
      },
      outline: {
        backgroundColor: 'transparent',
        color: '$color',
        borderWidth: 1,
        borderColor: '$borderColor',
        hoverStyle: {
          borderColor: '$borderColorHover',
          backgroundColor: '$backgroundHover',
        },
        pressStyle: {
          backgroundColor: '$backgroundPress',
        },
      },
      ghost: {
        backgroundColor: 'transparent',
        color: '$color',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$backgroundHover',
        },
        pressStyle: {
          backgroundColor: '$backgroundPress',
        },
      },
    },
  } as const,
  defaultVariants: {
    variant: 'primary',
  },
});

// Map public size API to button style properties
// This prevents getFontSize.mjs warnings by never passing 'sm|md|lg' to Tamagui
const mapButtonSizeToStyles = (size: 'sm' | 'md' | 'lg' | undefined) => {
  switch (size) {
    case 'sm':
      return {
        paddingHorizontal: '$3',
        paddingVertical: '$0.25', // Reduced by 25% from $1 to $0.75 (3px)
        fontSize: '$3', // Use numeric token instead of '$sm'
        // minHeight calculated: fontSize 13px * 1.2 lineHeight = 16px + paddingVertical $0.25*2 (2px) = 18px
        minHeight: 18,
      };
    case 'lg':
      return {
        paddingHorizontal: '$5',
        paddingVertical: '$1', // Reduced by 25% from $2 to $1.5 (6px)
        fontSize: '$5', // Use numeric token instead of '$lg'
        // minHeight calculated: fontSize 16px * 1.2 lineHeight = 20px + paddingVertical $1*2 (8px) = 28px
        minHeight: 28,
      };
    case 'md':
    default:
      return {
        paddingHorizontal: '$4',
        paddingVertical: '$0.5', // Reduced by 25% from $1.5 to $1 (4px)
        fontSize: '$4', // Use numeric token instead of '$md'
        // minHeight calculated: fontSize 14px * 1.2 lineHeight = 17px + paddingVertical $0.5*2 (4px) = 21px
        minHeight: 21,
      };
  }
};

// Wrapper that intercepts size prop and maps to style properties before passing to Tamagui
// This ensures getFontSize is never called with 'sm|md|lg' - only numeric tokens like '$3|$4|$5'
export const Button = forwardRef<any, ButtonProps>(function Button(
  props,
  ref
) {
  const { onPress, onClick, size, asChild, variant, ...rest } = props;
  const eventProps = resolvePressEvents({ onPress, onClick });
  const sizeStyles = mapButtonSizeToStyles(size);
  
  // onPress and onClick are already extracted above, so rest doesn't contain them
  // Never pass size="sm|md|lg" to Tamagui - only pass fontSize="$3|$4|$5" and other style props
  // When asChild is used, Tamagui should automatically filter non-DOM props
  return <ButtonFrame ref={ref} {...eventProps} {...sizeStyles} variant={variant} {...rest} asChild={asChild} />;
});
