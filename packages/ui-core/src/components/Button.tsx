'use client';

import { forwardRef } from 'react';
import { Button as TamaguiButton, styled } from 'tamagui';
import type { ButtonProps as TamaguiButtonProps } from 'tamagui';
import { resolvePressEvents } from '../utils/pressable';

export interface ButtonProps extends TamaguiButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const ButtonFrame = styled(TamaguiButton, {
  name: 'Button',
  fontFamily: '$body',
  borderRadius: '$3',
  fontWeight: '500',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$2',
  minHeight: '$6',
  // Set default fontSize to prevent auto-resolution issues
  fontSize: '$4',
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
        minHeight: '$6',
      },
      md: {
        paddingHorizontal: '$4',
        paddingVertical: '$3',
        fontSize: '$4',
        minHeight: '$7',
      },
      lg: {
        paddingHorizontal: '$5',
        paddingVertical: '$3.5',
        fontSize: '$5',
        minHeight: '$8',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export const Button = forwardRef<any, ButtonProps>(function Button(
  { onPress, onClick, ...rest },
  ref
) {
  const eventProps = resolvePressEvents({ onPress, onClick });
  return <ButtonFrame ref={ref} {...eventProps} {...rest} />;
});
