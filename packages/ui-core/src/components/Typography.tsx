'use client';

import { styled, Text as TamaguiText } from 'tamagui';
import { isWeb } from '@tamagui/constants';

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
  lineHeight: 1.5,
  margin: 0,
  marginBottom: '$2',
  width: '100%',
  minWidth: 0,
  display: 'block',
  variants: {
    level: {
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

export const Body = styled(TamaguiText, {
  name: 'Body',
  fontFamily: '$body',
  lineHeight: 1.5,
  margin: 0,
  marginBottom: '$2',
  width: '100%',
  minWidth: 0,
  display: 'block',
  variants: {
    size: {
      sm: { fontSize: '$2' },
      md: { fontSize: '$3' },
      lg: { fontSize: '$4' },
    },
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
    size: 'md',
    tone: 'default',
    weight: 'regular',
    align: 'left',
    whitespace: 'normal',
    mono: false,
    transform: 'none',
    decoration: 'none',
  },
});

export const Label = styled(TamaguiText, {
  name: 'Label',
  fontFamily: '$body',
  fontWeight: '600',
  lineHeight: 1.5,
  margin: 0,
  marginBottom: '$1',
  width: '100%',
  minWidth: 0,
  display: 'block',
  textTransform: 'none',
  letterSpacing: 0.2,
  variants: {
    size: {
      xs: { fontSize: '$1' },
      sm: { fontSize: '$2' },
      md: { fontSize: '$3' },
    },
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
    size: 'sm',
    tone: 'muted',
    uppercase: false,
    align: 'left',
    whitespace: 'normal',
    transform: 'none',
    decoration: 'none',
  },
});

export const Caption = styled(TamaguiText, {
  name: 'Caption',
  fontFamily: '$body',
  fontSize: '$1',
  lineHeight: 1.5,
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
