'use client';

import { YStack, styled } from 'tamagui';
import type { StackProps } from 'tamagui';
import { Text } from 'tamagui';

export interface BadgeProps extends Omit<StackProps, 'children'> {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'gray';
  size?: 'sm' | 'md';
}

const BadgeContainer = styled(YStack, {
  name: 'Badge',
  borderRadius: '$2',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
  gap: '$1',
  variants: {
    variant: {
      default: {
        backgroundColor: '$gray2',
      },
      blue: {
        backgroundColor: '$blue2',
      },
      yellow: {
        backgroundColor: '$yellow2',
      },
      green: {
        backgroundColor: '$green2',
      },
      red: {
        backgroundColor: '$red2',
      },
      purple: {
        backgroundColor: '$purple2',
      },
      gray: {
        backgroundColor: '$gray2',
      },
    },
    size: {
      sm: {
        paddingHorizontal: '$2.5',
        paddingVertical: '$1.5',
        minHeight: '$4',
      },
      md: {
        paddingHorizontal: '$3.5',
        paddingVertical: '$2',
        minHeight: '$5',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

const BadgeText = styled(Text, {
  name: 'BadgeText',
  fontWeight: '500',
  margin: 0,
  lineHeight: 1.2,
  variants: {
    variant: {
      default: {
        color: '$gray11',
      },
      blue: {
        color: '$blue11',
      },
      yellow: {
        color: '$yellow11',
      },
      green: {
        color: '$green11',
      },
      red: {
        color: '$red11',
      },
      purple: {
        color: '$purple11',
      },
      gray: {
        color: '$gray11',
      },
    },
    size: {
      sm: {
        fontSize: '$2',
      },
      md: {
        fontSize: '$3',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

export function Badge({ children, variant = 'default', size = 'md', ...props }: BadgeProps) {
  return (
    <BadgeContainer variant={variant} size={size} {...props}>
      <BadgeText variant={variant} size={size}>
        {children}
      </BadgeText>
    </BadgeContainer>
  );
}
