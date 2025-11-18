'use client';

import { YStack, Text, styled } from 'tamagui';

export interface AlertProps {
  variant?: 'error' | 'success' | 'warning' | 'info';
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
  variants: {
    variant: {
      error: {
        color: '$red11',
      },
      success: {
        color: '$green11',
      },
      warning: {
        color: '$yellow11',
      },
      info: {
        color: '$blue11',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'error',
  },
});

export function Alert({ variant = 'error', children }: AlertProps) {
  return (
    <AlertContainer variant={variant}>
      <AlertText variant={variant}>{children}</AlertText>
    </AlertContainer>
  );
}

