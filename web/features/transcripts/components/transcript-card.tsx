'use client';

import { memo, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { XStack, YStack, Card, Body, Caption } from '@jarvis/ui-core';
import type { Transcript } from '@/shared/hooks/use-transcripts-query';

interface TranscriptCardProps {
  transcript: Transcript;
}

/**
 * Memoized transcript card component
 * Optimized to prevent unnecessary re-renders when transcripts list updates
 */
export const TranscriptCard = memo(function TranscriptCard({ transcript }: TranscriptCardProps) {
  // Memoize expensive date formatting
  const timeAgo = useMemo(() => {
    const timestamp = new Date(transcript.at_ms);
    return formatDistanceToNow(timestamp, { addSuffix: true });
  }, [transcript.at_ms]);

  return (
    <Card key={transcript.id} variant="outlined" padding="$4">
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="$3"
      >
        <YStack flex={1} gap="$2">
          {transcript.speaker && (
            <Body size="sm" weight="medium" tone="muted">
              {transcript.speaker}
            </Body>
          )}
          <Body tone="muted" whitespace="preWrap">
            {transcript.text}
          </Body>
        </YStack>
        <YStack
          alignItems="flex-end"
          gap="$1"
          minWidth={120}
        >
          <Body size="sm" tone="muted" whitespace="nowrap">
            {timeAgo}
          </Body>
          <Caption mono>
            Seq: {transcript.seq}
          </Caption>
        </YStack>
      </XStack>
    </Card>
  );
});

