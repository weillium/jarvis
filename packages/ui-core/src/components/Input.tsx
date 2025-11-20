'use client';

import { forwardRef } from 'react';
import { Input as TamaguiInput, styled } from 'tamagui';
import type { InputProps as TamaguiInputProps } from 'tamagui';

export interface InputProps extends Omit<TamaguiInputProps, 'type' | 'required' | 'min' | 'step' | 'minLength' | 'autoComplete' | 'onKeyDown'> {
  error?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  type?: React.InputHTMLAttributes<HTMLInputElement>['type'];
  required?: boolean;
  min?: string;
  step?: number;
  minLength?: number;
  autoComplete?: string;
}

const StyledInput = styled(TamaguiInput, {
  name: 'Input',
  fontFamily: '$body',
  borderRadius: '$3',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  paddingHorizontal: '$4',
  paddingVertical: '$2', // Reduced from $3 (12px) to $2 (8px)
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

export const Input = forwardRef<any, InputProps>(function Input(props, ref) {
  const { onKeyDown, type, required, min, step, minLength, autoComplete, ...rest } = props;
  // Pass HTML input attributes that Tamagui might not recognize via type assertion
  const htmlProps = { type, required, min, step, minLength, autoComplete };
  return (
    <StyledInput
      ref={ref}
      onKeyDown={onKeyDown}
      {...(htmlProps as any)}
      {...rest}
    />
  );
});
