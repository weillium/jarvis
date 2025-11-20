'use client';

import { Input, styled } from 'tamagui';
import type { InputProps } from 'tamagui';
import React from 'react';
import { isWeb } from '@tamagui/constants';

export interface TextareaProps extends Omit<InputProps, 'multiline' | 'numberOfLines'> {
  error?: boolean;
  rows?: number;
  minHeight?: number;
}

// Use Input with multiline prop for Textarea
const StyledTextarea = styled(Input, {
  name: 'Textarea',
  fontFamily: '$body',
  borderRadius: '$3',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  fontSize: '$4',
  lineHeight: 1.5,
  width: '100%',
  ...(isWeb
    ? {
        '&::placeholder': {
          color: '$placeholderColor',
        },
      }
    : {
        placeholderTextColor: '$placeholderColor',
        textAlignVertical: 'top',
      }),
  multiline: true,
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

export const Textarea = React.forwardRef<any, TextareaProps>(
  ({ rows, minHeight, ...props }, ref) => {
    const nativeLineProps =
      !isWeb && typeof rows === 'number'
        ? { numberOfLines: rows }
        : undefined;

    return (
      <StyledTextarea
        ref={ref}
        {...props}
        {...nativeLineProps}
        minHeight={minHeight}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
