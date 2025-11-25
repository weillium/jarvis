'use client';

import { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranscriptsQuery } from '@/shared/hooks/use-transcripts-query';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage } from '@/shared/types/card';
import { TranscriptCard } from './transcript-card';
import { YStack, XStack, Button, Alert, Badge, Body, EmptyStateCard, LoadingState } from '@jarvis/ui-core';

import type { Transcript } from '@/shared/hooks/use-transcripts-query';

interface LiveTranscriptsProps {
  eventId: string;
}

interface TranscriptsVirtualListProps {
  transcripts: Transcript[];
}

/**
 * Virtualized list component for transcripts
 * Only renders visible items to improve performance with large lists
 */
function TranscriptsVirtualList({ transcripts }: TranscriptsVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: transcripts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated height per transcript card (reduced for tighter spacing)
    overscan: 5, // Render 5 extra items above/below viewport for smooth scrolling
  });

  return (
    <YStack height="calc(100vh - 300px)" position="relative">
      <div
        ref={parentRef}
        style={{
          height: '100%',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const transcript = transcripts[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TranscriptCard transcript={transcript} />
              </div>
            );
          })}
        </div>
      </div>
    </YStack>
  );
}

/**
 * Live Transcripts Component
 * Displays transcripts that are currently in the ring buffer (last 5 minutes, up to 1000)
 */
export function LiveTranscripts({ eventId }: LiveTranscriptsProps) {
  const { data, isLoading, error } = useTranscriptsQuery(eventId);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const { isConnected, isConnecting, reconnect } = useSSEStream({
    eventId,
    onMessage: (_message: SSEMessage) => {
      // No-op, we're just using this for connection status
    },
    onConnect: () => {
      setConnectionStatus('connected');
    },
    onDisconnect: () => {
      setConnectionStatus('disconnected');
    },
    onError: () => {
      setConnectionStatus('disconnected');
    },
  });

  // Update connection status based on hook state
  useEffect(() => {
    if (isConnecting) {
      setConnectionStatus('connecting');
    } else if (isConnected) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [isConnected, isConnecting]);

  const transcripts = data?.transcripts || [];

  const connectionVariant = connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'error';
  const connectionColor = connectionStatus === 'connected' ? '$green11' : connectionStatus === 'connecting' ? '$yellow11' : '$red11';

  return (
    <YStack padding="$8">
      {/* Connection Status */}
      <Alert variant={connectionVariant} marginBottom="$5">
        <XStack
          alignItems="center"
          justifyContent="space-between"
          width="100%"
          gap="$3"
        >
          <XStack alignItems="center" gap="$2" flexShrink={0}>
            <Badge variant={connectionStatus === 'connected' ? 'green' : connectionStatus === 'connecting' ? 'yellow' : 'red'} size="sm">
              {connectionStatus.toUpperCase()}
            </Badge>
            <Body size="md" weight="medium" color={connectionColor} margin={0}>
              {connectionStatus === 'connected'
                ? 'Connected - Receiving live updates'
                : connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'}
            </Body>
          </XStack>
          {connectionStatus === 'disconnected' && (
            <Button
              variant="primary"
              size="sm"
              onClick={reconnect}
              flexShrink={0}
            >
              Reconnect
            </Button>
          )}
        </XStack>
      </Alert>

      {isLoading ? (
        <LoadingState
          title="Loading transcripts"
          description="Fetching the latest transcript buffer."
        />
      ) : error ? (
        <EmptyStateCard
          title="Unable to load transcripts"
          description={`Failed to load transcripts: ${error instanceof Error ? error.message : 'Unknown error'}`}
        />
      ) : transcripts.length === 0 ? (
        <EmptyStateCard
          title="No transcripts yet"
          description="Transcripts will appear as they are processed during the event."
        />
      ) : (
        <TranscriptsVirtualList transcripts={transcripts} />
      )}
    </YStack>
  );
}
