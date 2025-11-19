'use client';

import { styled, Text as TamaguiText } from 'tamagui';

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

export const Heading = styled(TamaguiText, {
  name: 'Heading',
  fontFamily: '$heading',
  fontWeight: '600',
  lineHeight: 1.2,
  margin: 0,
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
  } as const,
  defaultVariants: {
    level: 3,
    tone: 'default',
    align: 'left',
  },
});

export const Body = styled(TamaguiText, {
  name: 'Body',
  fontFamily: '$body',
  lineHeight: 1.5,
  margin: 0,
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
  } as const,
  defaultVariants: {
    size: 'md',
    tone: 'default',
    weight: 'regular',
    align: 'left',
  },
});

export const Label = styled(TamaguiText, {
  name: 'Label',
  fontFamily: '$body',
  fontWeight: '600',
  margin: 0,
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
  } as const,
  defaultVariants: {
    size: 'sm',
    tone: 'muted',
    uppercase: false,
    align: 'left',
  },
});

export const Caption = styled(TamaguiText, {
  name: 'Caption',
  fontFamily: '$body',
  fontSize: '$1',
  lineHeight: 1.4,
  color: '$gray11',
  margin: 0,
  variants: {
    tone: toneVariants,
    align: alignmentVariants,
  } as const,
  defaultVariants: {
    tone: 'muted',
    align: 'left',
  },
});
