'use client';

import { useState, useEffect } from 'react';
import { useTranscriptsQuery } from '@/shared/hooks/use-transcripts-query';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage } from '@/shared/types/card';
import { formatDistanceToNow } from 'date-fns';
import { YStack, XStack, Button, Card, Alert, Badge, Body, EmptyStateCard, LoadingState } from '@jarvis/ui-core';

interface LiveTranscriptsProps {
  eventId: string;
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

  if (isLoading) {
    return (
      <LoadingState
        title="Loading transcripts"
        description="Fetching the latest transcript buffer."
        padding="$12 $6"
        skeletons={[{ height: 48 }, { height: 48 }, { height: 48 }]}
      />
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <Body>
          Error loading transcripts: {error instanceof Error ? error.message : 'Unknown error'}
        </Body>
      </Alert>
    );
  }

  const transcripts = data?.transcripts || [];

  const connectionVariant = connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'error';
  const connectionColor = connectionStatus === 'connected' ? '$green11' : connectionStatus === 'connecting' ? '$yellow11' : '$red11';
  const connectionColorHex = connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'connecting' ? '#eab308' : '#ef4444';

  return (
    <YStack>
      {/* Connection Status */}
      <Alert variant={connectionVariant} marginBottom="$5">
        <XStack
          alignItems="center"
          justifyContent="space-between"
          width="100%"
        >
          <XStack alignItems="center" gap="$2">
            <Badge variant={connectionStatus === 'connected' ? 'green' : connectionStatus === 'connecting' ? 'yellow' : 'red'} size="sm">
              {connectionStatus.toUpperCase()}
            </Badge>
            <Body size="md" weight="medium" color={connectionColor}>
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
              onPress={reconnect}
            >
              Reconnect
            </Button>
          )}
        </XStack>
      </Alert>

      {transcripts.length === 0 ? (
        <EmptyStateCard
          title="No transcripts yet"
          description="Transcripts will appear as they are processed during the event."
          padding="$16 $6"
          borderRadius="$5"
          borderStyle="dashed"
          borderColor="$gray4"
        />
      ) : (
        <YStack
          gap="$3"
          maxHeight="calc(100vh - 300px)"
          overflowY="auto"
        >
          {transcripts.map((transcript) => {
            const timestamp = new Date(transcript.at_ms);
            const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

            return (
              <Card key={transcript.id} variant="outlined" padding="$4" marginBottom="$3">
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
                    <Body lineHeight={1.6} tone="muted" whiteSpace="pre-wrap" wordBreak="break-word">
                      {transcript.text}
                    </Body>
                  </YStack>
                  <YStack
                    alignItems="flex-end"
                    gap="$1"
                    minWidth={120}
                  >
                    <Body size="sm" tone="muted" whiteSpace="nowrap">
                      {timeAgo}
                    </Body>
                    <Body size="xs" tone="muted" fontFamily="$mono">
                      Seq: {transcript.seq}
                    </Body>
                  </YStack>
                </XStack>
              </Card>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
}
