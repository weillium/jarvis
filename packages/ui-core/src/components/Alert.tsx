'use client';

import { YStack, Text, styled, type StackProps } from 'tamagui';

export interface AlertProps extends Omit<StackProps, 'children'> {
  variant?: 'error' | 'danger' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
}

const AlertContainer = styled(YStack, {
  name: 'Alert',
  padding: '$3',
  borderRadius: '$3',
  borderWidth: 1,
  variants: {
    variant: {
      error: {
        backgroundColor: '$red2',
        borderColor: '$red4',
      },
      danger: {
        // Danger variant should be red-themed (same as error)
        backgroundColor: '$red2',
        borderColor: '$red4',
      },
      success: {
        backgroundColor: '$green2',
        borderColor: '$green4',
      },
      warning: {
        backgroundColor: '$yellow2',
        borderColor: '$yellow4',
      },
      info: {
        backgroundColor: '$blue2',
        borderColor: '$blue4',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'error',
  },
});

const AlertText = styled(Text, {
  name: 'AlertText',
  fontSize: '$3',
  // Explicitly set color to ensure variant colors override any defaults
  variants: {
    variant: {
      error: {
        color: '$red11',
      },
      danger: {
        // Danger variant should be red-themed (same as error)
        color: '$red11',
      },
      success: {
        color: '$green11',
      },
      warning: {
        color: '$yellow11',
      },
      info: {
        color: '$blue11', // Info text should be blue-themed
      },
    },
  } as const,
  defaultVariants: {
    variant: 'error',
  },
});

export function Alert({ variant = 'error', children, ...stackProps }: AlertProps) {
  // Explicitly set color based on variant to ensure it's applied
  const textColor = 
    variant === 'info' ? '$blue11' :
    variant === 'success' ? '$green11' :
    variant === 'warning' ? '$yellow11' :
    variant === 'danger' || variant === 'error' ? '$red11' :
    '$red11';
  
  return (
    <AlertContainer variant={variant} {...stackProps}>
      <AlertText variant={variant} color={textColor}>{children}</AlertText>
    </AlertContainer>
  );
}

