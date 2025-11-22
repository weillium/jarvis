'use client';

import { forwardRef, useState } from 'react';
import type { KeyboardEvent, InputHTMLAttributes } from 'react';
import { Input as TamaguiInput, styled, XStack, useTheme } from 'tamagui';
import type { InputProps as TamaguiInputProps } from 'tamagui';
import { Button } from './Button';
import { EyeIcon, EyeOffIcon } from '../icons';

export interface InputProps
  extends Omit<
    TamaguiInputProps,
    | 'type'
    | 'required'
    | 'min'
    | 'step'
    | 'minLength'
    | 'autoComplete'
    | 'inputMode'
    | 'onKeyDown'
  > {
  error?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  type?: InputHTMLAttributes<HTMLInputElement>['type'];
  required?: boolean;
  min?: string;
  step?: number;
  minLength?: number;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maskToggle?: boolean;
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
  paddingVertical: '$0.5', // Reduced from $3 (12px) to $2 (8px)
  fontSize: '$4',
  lineHeight: 1.4,
  width: '100%',
  minWidth: 0,
  flexBasis: 0,
  flexGrow: 1,
  flexShrink: 1,
  // minHeight calculated: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $0.5*2 (4px) = 24px
  minHeight: 24,
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

// Native input component styled to match Tamagui Input for password fields
// Using a function component with inline styles for full control over type attribute
const NativePasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  ({ error, style, className, onFocus, onBlur, ...props }, ref) => {
    const theme = useTheme();
    
    // Helper to get theme value as pixel string
    const getThemeValue = (val: unknown, fallback: string): string => {
      if (typeof val === 'number') {
        return `${val}px`;
      }
      if (typeof val === 'string') {
        return val;
      }
      return fallback;
    };
    
    // Use measured height from actual Tamagui Input: 46px
    // This accounts for Tamagui's internal height calculation which may include
    // additional spacing, line-height calculations, or size token-based height
    const baseStyle: React.CSSProperties = {
      fontFamily: (theme.bodyFont?.val as string) || 'inherit',
      borderRadius: '9px', // $3
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: error 
        ? (getThemeValue(theme.red6?.val, '#ef4444'))
        : (getThemeValue(theme.borderColor?.val, '#e2e8f0')),
      backgroundColor: getThemeValue(theme.background?.val, '#ffffff'),
      color: getThemeValue(theme.color?.val, '#0f172a'),
      // Match Tamagui Input padding exactly
      paddingLeft: '16px', // $4
      paddingRight: '32px', // $8 (extra space for toggle button)
      paddingTop: '2px', // $0.5
      paddingBottom: '2px', // $0.5
      // Match Tamagui Input font size
      fontSize: '14px', // $4
      lineHeight: 1.4,
      width: '100%',
      minWidth: 0,
      // Use measured height from actual Tamagui Input component
      height: '46px',
      minHeight: '46px',
      boxSizing: 'border-box',
      outline: 'none',
      display: 'block',
      margin: 0,
    };
    
    return (
      <>
        <style>{`
          input[data-password-input]::placeholder {
            color: ${(theme.placeholderColor?.val as string) || '#94a3b8'};
          }
          input[data-password-input]:focus {
            border-color: ${error ? (theme.red7?.val as string) : (theme.blue6?.val as string)} !important;
          }
          input[data-password-input]:disabled {
            background-color: ${theme.backgroundHover?.val as string};
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
        <input
          ref={ref}
          data-password-input
          {...props}
          className={className}
          style={{ ...baseStyle, ...(style || {}) }}
          onFocus={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            e.currentTarget.style.borderColor = error
              ? (theme.red7?.val as string)
              : (theme.blue6?.val as string);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            e.currentTarget.style.borderColor = error
              ? (theme.red6?.val as string)
              : (theme.borderColor?.val as string);
            onBlur?.(e);
          }}
        />
      </>
    );
  }
);
NativePasswordInput.displayName = 'NativePasswordInput';

export const Input = forwardRef<any, InputProps>(function Input(props, ref) {
  const {
    onKeyDown,
    type = 'text',
    required,
    min,
    step,
    minLength,
    autoComplete,
    inputMode,
    maskToggle,
    error,
    ...rest
  } = props;

  const shouldEnableMask = maskToggle && type === 'password';
  // Default to masked (false = password is hidden)
  const [showValue, setShowValue] = useState(false);
  
  const resolvedType =
    shouldEnableMask && showValue ? 'text' : type;
  const resolvedAutoComplete =
    shouldEnableMask && !showValue ? 'current-password' : autoComplete;
  const resolvedInputMode =
    shouldEnableMask && !showValue ? undefined : inputMode;

  // For password fields with maskToggle, use native input for full control
  if (shouldEnableMask) {
    // Extract only valid HTML input props from rest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const {
      value,
      onChange,
      placeholder,
      disabled,
      id,
      name,
      className,
      style,
    } = rest as any;
    
    return (
      <XStack width="100%" alignItems="center" position="relative">
        <NativePasswordInput
          ref={ref}
          type={resolvedType}
          onKeyDown={onKeyDown}
          required={required}
          min={min}
          step={step}
          minLength={minLength}
          autoComplete={resolvedAutoComplete}
          inputMode={resolvedInputMode}
          error={error}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          id={id}
          name={name}
          className={className}
          style={style}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={showValue ? 'Hide password' : 'Show password'}
          aria-pressed={showValue}
          onPress={() => setShowValue((prev) => !prev)}
          position="absolute"
          right="$2"
          paddingHorizontal="$2"
          paddingVertical="$0"
          minHeight="unset"
          height="auto"
        >
          {showValue ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </Button>
      </XStack>
    );
  }

  // For all other inputs, use Tamagui Input
  return (
    <StyledInput
      ref={ref}
      onKeyDown={onKeyDown}
      {...rest}
      {...({
        type: resolvedType,
        required,
        min,
        step,
        minLength,
        autoComplete: resolvedAutoComplete,
        inputMode: resolvedInputMode,
        error,
      } as any)}
    />
  );
});
