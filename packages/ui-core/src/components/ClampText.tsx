'use client';

import { forwardRef } from 'react';
import { Text as TamaguiText, type TextProps } from 'tamagui';
import { isWeb } from '@tamagui/constants';

export interface ClampTextProps extends TextProps {
  lines?: number;
}

export const ClampText = forwardRef<any, ClampTextProps>(function ClampText(
  { lines, style, ...rest },
  ref
) {
  const clampLines = typeof lines === 'number' ? Math.max(lines, 1) : undefined;
  const webStyles =
    isWeb && clampLines
      ? {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical' as const,
          WebkitLineClamp: clampLines,
        }
      : undefined;

  return (
    <TamaguiText
      ref={ref}
      {...rest}
      {...(!isWeb && clampLines ? { numberOfLines: clampLines, ellipsizeMode: 'tail' as const } : {})}
      style={webStyles ? { ...webStyles, ...style } : style}
    />
  );
});
