'use client';

import { styled } from 'tamagui';
import type { TamaguiElement } from 'tamagui';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  size?: 'sm' | 'md';
}

const StyledSelect = styled('select', {
  name: 'Select',
  fontFamily: '$body',
  borderRadius: '$2',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  cursor: 'pointer',
  transition: 'all 0.2s',
  variants: {
    size: {
      sm: {
        paddingHorizontal: '$3',
        paddingVertical: '$2',
        fontSize: '$3',
        height: '$4',
      },
      md: {
        paddingHorizontal: '$3',
        paddingVertical: '$2.5',
        fontSize: '$4',
        height: '$5',
      },
    },
  } as const,
  defaultVariants: {
    size: 'md',
  },
  hoverStyle: {
    borderColor: '$borderColorHover',
    backgroundColor: '$backgroundHover',
  },
  focusStyle: {
    borderColor: '$blue6',
    outline: 'none',
    boxShadow: '0 0 0 2px $blue2',
  },
  disabledStyle: {
    opacity: 0.6,
    cursor: 'not-allowed',
    backgroundColor: '$gray1',
  },
});

export function Select({ size = 'md', style, ...props }: SelectProps) {
  return (
    <StyledSelect
      size={size}
      style={{
        ...style,
        fontFamily: 'inherit',
      }}
      {...props}
    />
  );
}

