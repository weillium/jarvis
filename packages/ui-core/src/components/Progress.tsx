'use client';

import { styled, YStack } from 'tamagui';

const Track = styled(YStack, {
  name: 'ProgressTrack',
  width: '100%',
  height: 8,
  borderRadius: '$2',
  backgroundColor: '$gray3',
  overflow: 'hidden',
});

const Fill = styled(YStack, {
  name: 'ProgressFill',
  height: '100%',
  backgroundColor: '$blue6',
  transition: 'width 0.3s ease',
});

const IndeterminateFill = styled(Fill, {
  name: 'ProgressIndeterminate',
  width: '35%',
  backgroundColor: '$blue4',
  opacity: 0.6,
});

interface ProgressBarProps {
  value?: number | null;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const clamped = typeof value === 'number' ? Math.min(Math.max(value, 0), 100) : null;

  return (
    <Track>
      {clamped !== null ? (
        <Fill width={`${clamped}%`} />
      ) : (
        <IndeterminateFill />
      )}
    </Track>
  );
}
