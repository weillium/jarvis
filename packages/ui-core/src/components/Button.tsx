'use client';

import { Button as TamaguiButton, styled } from 'tamagui';
import type { ButtonProps as TamaguiButtonProps } from 'tamagui';

export interface ButtonProps extends TamaguiButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = styled(TamaguiButton, {
  name: 'Button',
  fontFamily: '$body',
  borderRadius: '$3',
  fontWeight: '500',
  cursor: 'pointer',
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
    size: {
      sm: {
        paddingHorizontal: '$3',
        paddingVertical: '$2',
        fontSize: '$3',
        height: '$4',
      },
      md: {
        paddingHorizontal: '$4',
        paddingVertical: '$3',
        fontSize: '$4',
        height: '$5',
      },
      lg: {
        paddingHorizontal: '$5',
        paddingVertical: '$4',
        fontSize: '$5',
        height: '$6',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

