'use client';

import { YStack, styled } from 'tamagui';
import type { StackProps } from 'tamagui';
import { Text } from 'tamagui';

export interface BadgeProps extends Omit<StackProps, 'children' | 'inset'> {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'gray' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  backgroundColor?: string;
  color?: string;
}

const BadgeContainer = styled(YStack, {
  name: 'Badge',
  borderRadius: '$2',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
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
      // Semantic variants that map to color variants
      success: {
        backgroundColor: '$green2',
      },
      warning: {
        backgroundColor: '$yellow2',
      },
      danger: {
        backgroundColor: '$red2',
      },
      info: {
        backgroundColor: '$blue2',
      },
    },
    size: {
      sm: {
        paddingHorizontal: '$2',
        paddingVertical: '$2',
        // minHeight calculated: fontSize (13px) + paddingVertical ($2 = 8px top + 8px bottom = 16px) = 29px
        minHeight: 29,
      },
      md: {
        paddingHorizontal: '$3.5',
        paddingVertical: '$3.5',
        // minHeight calculated: fontSize (14px) + paddingVertical ($3.5 = 14px top + 14px bottom = 28px) = 42px
        minHeight: 42,
      },
    },
  } as const,
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

// Base styled component without size variant to avoid passing size to Tamagui
const BadgeTextBase = styled(Text, {
  name: 'BadgeText',
  fontWeight: '500',
  margin: 0,
  lineHeight: 1,
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
      // Semantic variants that map to color variants
      success: {
        color: '$green11',
      },
      warning: {
        color: '$yellow11',
      },
      danger: {
        color: '$red11',
      },
      info: {
        color: '$blue11',
      },
    },
    size: {
      sm: {
        fontSize: '$3',
      },
      md: {
        fontSize: '$4',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

export function Badge({ children, variant = 'default', size = 'md', backgroundColor, color, ...props }: BadgeProps) {
  // Explicitly set color based on variant to ensure it's applied
  const textColor = color || (
    variant === 'info' ? '$blue11' :
    variant === 'success' ? '$green11' :
    variant === 'warning' ? '$yellow11' :
    variant === 'danger' ? '$red11' :
    variant === 'blue' ? '$blue11' :
    variant === 'green' ? '$green11' :
    variant === 'yellow' ? '$yellow11' :
    variant === 'red' ? '$red11' :
    variant === 'purple' ? '$purple11' :
    variant === 'gray' ? '$gray11' :
    '$gray11'
  );
  
  return (
    <BadgeContainer variant={variant} size={size} backgroundColor={backgroundColor} {...(props as any)}>
      <BadgeTextBase variant={variant} size={size} color={textColor}>
        {children}
      </BadgeTextBase>
    </BadgeContainer>
  );
}
