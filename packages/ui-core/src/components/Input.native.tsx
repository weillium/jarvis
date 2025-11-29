import { forwardRef, useState } from 'react';
import { Input as TamaguiInput, styled, XStack, Text } from 'tamagui';
import type { InputProps as TamaguiInputProps } from 'tamagui';
import { Button } from './Button';

export interface InputProps extends Omit<TamaguiInputProps, 'secureTextEntry'> {
  error?: boolean;
  secureTextEntry?: boolean;
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
  paddingVertical: '$3',
  fontSize: '$4',
  // Remove lineHeight to prevent text clipping on React Native
  width: '100%',
  minWidth: 0,
  minHeight: 44, // Better touch target for mobile
  placeholderTextColor: '$placeholderColor',
  focusStyle: {
    borderColor: '$blue6',
    outlineWidth: 0,
  },
  disabledStyle: {
    backgroundColor: '$backgroundHover',
    opacity: 0.6,
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
  const { secureTextEntry, error, ...rest } = props;
  const [showPassword, setShowPassword] = useState(false);

  // If secureTextEntry is enabled, wrap with password toggle
  if (secureTextEntry) {
    return (
      <XStack width="100%" alignItems="center" position="relative">
        <StyledInput
          ref={ref}
          secureTextEntry={!showPassword}
          error={error}
          paddingRight="$10"
          {...rest}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          onPress={() => setShowPassword((prev) => !prev)}
          position="absolute"
          right="$2"
          paddingHorizontal="$2"
          paddingVertical="$0"
          minHeight="unset"
          height="auto"
          zIndex={1}
        >
          <Text fontSize="$2" color="$gray11">
            {showPassword ? 'Hide' : 'Show'}
          </Text>
        </Button>
      </XStack>
    );
  }

  return <StyledInput ref={ref} error={error} {...rest} />;
});
