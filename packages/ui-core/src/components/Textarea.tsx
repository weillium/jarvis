'use client';

import { Input, styled } from 'tamagui';
import type { InputProps } from 'tamagui';
import React from 'react';

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
  paddingVertical: '$2', // Reduced from $3 (12px) to $2 (8px)
  fontSize: '$4',
  width: '100%',
  placeholderTextColor: '$placeholderColor',
  multiline: true,
  textAlignVertical: 'top',
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
    return (
      <StyledTextarea
        ref={ref}
        {...props}
        numberOfLines={rows}
        minHeight={minHeight}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

