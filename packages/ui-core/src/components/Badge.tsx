'use client';

import { YStack, styled } from 'tamagui';
import type { StackProps } from 'tamagui';
import { Text } from 'tamagui';

export interface BadgeProps extends Omit<StackProps, 'children'> {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'gray' | 'success' | 'warning' | 'danger' | 'info';
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

// Base styled component without size variant to avoid passing size to Tamagui
const BadgeTextBase = styled(Text, {
  name: 'BadgeText',
  fontWeight: '500',
  margin: 0,
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
  } as const,
  defaultVariants: {
    variant: 'default',
  },
});

// Map public size API to numeric fontSize tokens
// This prevents getFontSize.mjs warnings by never passing 'sm|md' to Tamagui
const mapBadgeSizeToFontSize = (size: 'sm' | 'md' | undefined): string => {
  switch (size) {
    case 'sm':
      return '$3'; // 13px
    case 'md':
    default:
      return '$4'; // 14px
  }
};

export function Badge({ children, variant = 'default', size = 'md', ...props }: BadgeProps) {
  const fontSize = mapBadgeSizeToFontSize(size);
  // Explicitly set color based on variant to ensure it's applied
  const textColor = 
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
    '$gray11';
  
  return (
    <BadgeContainer variant={variant} size={size} {...props}>
      {/* Never pass size="sm|md" to Tamagui - only pass fontSize="$3|$4" */}
      <BadgeTextBase variant={variant} fontSize={fontSize} color={textColor}>
        {children}
      </BadgeTextBase>
    </BadgeContainer>
  );
}
