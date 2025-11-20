'use client';

import { Input as TamaguiInput, styled } from 'tamagui';
import type { InputProps as TamaguiInputProps } from 'tamagui';

export interface InputProps extends TamaguiInputProps {
  error?: boolean;
}

export const Input = styled(TamaguiInput, {
  name: 'Input',
  fontFamily: '$body',
  borderRadius: '$3',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  fontSize: '$4',
  lineHeight: 1.4,
  width: '100%',
  minHeight: '$6',
  placeholderTextColor: '$placeholderColor',
  focusStyle: {
    borderColor: '$blue6',
    outlineWidth: 0,
  },
  disabledStyle: {
    backgroundColor: '$backgroundHover',
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  variants: {
    error: {
      true: {
        borderColor: '$red6',
        focusStyle: {
          borderColor: '$red7',
        },
      },
    },
  } as const,
});
