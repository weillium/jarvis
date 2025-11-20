'use client';

import { styled, Text as TamaguiText } from 'tamagui';
import { isWeb } from '@tamagui/constants';
import { forwardRef } from 'react';

const webOnly = (style: Record<string, any>) => (isWeb ? style : {});

const toneVariants = {
  default: {
    color: '$color',
  },
  muted: {
    color: '$gray11',
  },
  subtle: {
    color: '$gray7',
  },
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
} as const;

const alignmentVariants = {
  left: {
    textAlign: 'left',
  },
  center: {
    textAlign: 'center',
  },
  right: {
    textAlign: 'right',
  },
} as const;

const transformVariants = {
  none: {},
  uppercase: {
    textTransform: 'uppercase',
  },
  capitalize: {
    textTransform: 'capitalize',
  },
  lowercase: {
    textTransform: 'lowercase',
  },
} as const;

const decorationVariants = {
  none: {},
  underline: {
    textDecorationLine: 'underline',
  },
} as const;

const whitespaceVariants = {
  normal: {},
  preLine: webOnly({ whiteSpace: 'pre-line' }),
  preWrap: webOnly({ whiteSpace: 'pre-wrap' }),
  nowrap: webOnly({ whiteSpace: 'nowrap' }),
} as const;

export const Heading = styled(TamaguiText, {
  name: 'Heading',
  fontFamily: '$heading',
  fontWeight: '600',
  margin: 0,
  marginBottom: '$2',
  width: '100%',
  minWidth: 0,
  display: 'block',
  variants: {
    level: {
      // For numeric tokens, let the font handle lineHeight automatically
      1: { fontSize: '$8' },
      2: { fontSize: '$7' },
      3: { fontSize: '$6' },
      4: { fontSize: '$5' },
      5: { fontSize: '$4' },
    },
    tone: toneVariants,
    align: alignmentVariants,
    transform: transformVariants,
    decoration: decorationVariants,
  } as const,
  defaultVariants: {
    level: 3,
    tone: 'default',
    align: 'left',
    transform: 'none',
    decoration: 'none',
  },
});

// Base styled component without size variant to avoid passing size to Tamagui
const BodyBase = styled(TamaguiText, {
  name: 'Body',
  fontFamily: '$body',
  margin: 0,
  marginBottom: '$2',
  width: '100%',
  minWidth: 0,
  display: 'block',
  variants: {
    tone: toneVariants,
    weight: {
      regular: { fontWeight: '400' },
      medium: { fontWeight: '500' },
      bold: { fontWeight: '600' },
    },
    align: alignmentVariants,
    whitespace: whitespaceVariants,
    mono: {
      true: { fontFamily: '$mono' },
      false: {},
    },
    transform: transformVariants,
    decoration: decorationVariants,
  } as const,
  defaultVariants: {
    tone: 'default',
    weight: 'regular',
    align: 'left',
    whitespace: 'normal',
    mono: false,
    transform: 'none',
    decoration: 'none',
  },
});

// Map public size API to numeric fontSize tokens
// This prevents getFontSize.mjs warnings by never passing 'sm|md|lg' to Tamagui
const mapBodySizeToFontSize = (size: 'sm' | 'md' | 'lg' | undefined): string => {
  switch (size) {
    case 'sm':
      return '$3'; // 13px
    case 'lg':
      return '$5'; // 16px
    case 'md':
    default:
      return '$4'; // 14px
  }
};

// Wrapper that intercepts size prop and maps to fontSize before passing to Tamagui
// This ensures getFontSize is never called with 'sm|md|lg' - only numeric tokens like '$3|$4|$5'
export const Body = forwardRef<any, any>(function Body(props, ref) {
  const { size, ...rest } = props;
  const fontSize = mapBodySizeToFontSize(size as 'sm' | 'md' | 'lg' | undefined);
  // Never pass size="sm|md|lg" to Tamagui - only pass fontSize="$3|$4|$5"
  return <BodyBase ref={ref} fontSize={fontSize} {...rest} />;
});

// Base styled component without size variant to avoid passing size to Tamagui
const LabelBase = styled(TamaguiText, {
  name: 'Label',
  fontFamily: '$body',
  fontWeight: '600',
  margin: 0,
  marginBottom: '$1',
  width: '100%',
  minWidth: 0,
  display: 'block',
  textTransform: 'none',
  letterSpacing: 0.2,
  variants: {
    tone: toneVariants,
    uppercase: {
      true: {
        textTransform: 'uppercase',
        letterSpacing: 0.8,
      },
      false: {
        textTransform: 'none',
      },
    },
    align: alignmentVariants,
    whitespace: whitespaceVariants,
    transform: transformVariants,
    decoration: decorationVariants,
  } as const,
  defaultVariants: {
    tone: 'muted',
    uppercase: false,
    align: 'left',
    whitespace: 'normal',
    transform: 'none',
    decoration: 'none',
  },
});

// Map public size API to numeric fontSize tokens
// This prevents getFontSize.mjs warnings by never passing 'xs|sm|md' to Tamagui
const mapLabelSizeToFontSize = (size: 'xs' | 'sm' | 'md' | undefined): string => {
  switch (size) {
    case 'xs':
      return '$1'; // 11px
    case 'sm':
      return '$3'; // 13px
    case 'md':
    default:
      return '$4'; // 14px
  }
};

// Wrapper that intercepts size prop and maps to fontSize before passing to Tamagui
// This ensures getFontSize is never called with 'xs|sm|md' - only numeric tokens like '$1|$3|$4'
export const Label = forwardRef<any, any>(function Label(props, ref) {
  const { size, ...rest } = props;
  const fontSize = mapLabelSizeToFontSize(size as 'xs' | 'sm' | 'md' | undefined);
  // Never pass size="xs|sm|md" to Tamagui - only pass fontSize="$1|$3|$4"
  return <LabelBase ref={ref} fontSize={fontSize} {...rest} />;
});

export const Caption = styled(TamaguiText, {
  name: 'Caption',
  fontFamily: '$body',
  fontSize: '$1',
  // Let the font handle lineHeight automatically for numeric tokens
  color: '$gray11',
  margin: 0,
  marginBottom: '$1',
  width: '100%',
  minWidth: 0,
  display: 'block',
  variants: {
    tone: toneVariants,
    align: alignmentVariants,
    whitespace: whitespaceVariants,
    mono: {
      true: { fontFamily: '$mono' },
      false: {},
    },
    transform: transformVariants,
    decoration: decorationVariants,
  } as const,
  defaultVariants: {
    tone: 'muted',
    align: 'left',
    whitespace: 'normal',
    mono: false,
    transform: 'none',
    decoration: 'none',
  },
});
