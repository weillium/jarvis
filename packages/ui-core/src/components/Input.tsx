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
  paddingVertical: '$2',
  fontSize: '$4',
  lineHeight: 1.4,
  width: '100%',
  minWidth: 0,
  flexBasis: 0,
  flexGrow: 1,
  flexShrink: 1,
  // minHeight calculated: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $2*2 (16px) = 36px
  minHeight: 36,
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
    
    // Calculate height to match StyledInput: fontSize 14px * 1.4 lineHeight = 20px + paddingVertical $2*2 (16px) = 36px
    const fontSize = 14; // $4
    const lineHeight = 1.4;
    const paddingVertical = 8; // $2
    const calculatedHeight = Math.round(fontSize * lineHeight + paddingVertical * 2);
    
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
      paddingTop: `${paddingVertical}px`, // $2
      paddingBottom: `${paddingVertical}px`, // $2
      // Match Tamagui Input font size
      fontSize: `${fontSize}px`, // $4
      lineHeight: lineHeight,
      width: '100%',
      minWidth: 0,
      // Use calculated height to match StyledInput
      minHeight: `${calculatedHeight}px`,
      boxSizing: 'border-box',
      outline: 'none',
      display: 'block',
      margin: 0,
    };
    
    return (
      <>
        <style>{`
          input[data-password-input]::placeholder {
            color: ${theme.placeholderColor?.val || '#94a3b8'};
          }
          input[data-password-input]:focus {
            border-color: ${error ? theme.red7?.val : theme.blue6?.val} !important;
          }
          input[data-password-input]:disabled {
            background-color: ${theme.backgroundHover?.val};
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
            e.currentTarget.style.borderColor = error
              ? String(theme.red7?.val || '')
              : String(theme.blue6?.val || '');
            onFocus?.(e);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error
              ? String(theme.red6?.val || '')
              : String(theme.borderColor?.val || '');
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
    const {
      value,
      onChange,
      placeholder,
      disabled,
      id,
      name,
      className,
      style,
    } = rest as {
      value?: string;
      onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
      placeholder?: string;
      disabled?: boolean;
      id?: string;
      name?: string;
      className?: string;
      style?: React.CSSProperties;
    };
    
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
