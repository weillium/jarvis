'use client';

import { useState, useEffect } from 'react';
import { useTranscriptsQuery } from '@/shared/hooks/use-transcripts-query';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage } from '@/shared/types/card';
import { formatDistanceToNow } from 'date-fns';
import { YStack, XStack, Text, Button, Card, Alert } from '@jarvis/ui-core';

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
      <YStack padding="$6" alignItems="center">
        <Text fontSize="$3" color="$gray5">
          Loading transcripts...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <Text fontSize="$3" margin={0}>
          Error loading transcripts: {error instanceof Error ? error.message : 'Unknown error'}
        </Text>
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
            <YStack
              width={8}
              height={8}
              borderRadius="$10"
              backgroundColor={connectionColorHex}
            />
            <Text
              fontSize="$3"
              fontWeight="500"
              color={connectionColor}
              margin={0}
            >
              {connectionStatus === 'connected'
                ? 'Connected - Receiving live updates'
                : connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'}
            </Text>
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
        <YStack padding="$6" alignItems="center">
          <Text fontSize="$3" color="$gray5">
            No transcripts in ring buffer yet. Transcripts will appear as they are processed during the event.
          </Text>
        </YStack>
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
              <Card
                key={transcript.id}
                variant="outlined"
                padding="$4"
              >
                <XStack
                  justifyContent="space-between"
                  alignItems="flex-start"
                  gap="$3"
                >
                  <YStack flex={1} gap="$2">
                    {transcript.speaker && (
                      <Text
                        fontSize="$2"
                        fontWeight="600"
                        color="$gray9"
                        margin={0}
                      >
                        {transcript.speaker}
                      </Text>
                    )}
                    <Text
                      fontSize="$3"
                      color="$gray9"
                      lineHeight={1.6}
                      whiteSpace="pre-wrap"
                      wordBreak="break-word"
                      margin={0}
                    >
                      {transcript.text}
                    </Text>
                  </YStack>
                  <YStack
                    alignItems="flex-end"
                    gap="$1"
                    minWidth={120}
                  >
                    <Text
                      fontSize="$2"
                      color="$gray5"
                      whiteSpace="nowrap"
                      margin={0}
                    >
                      {timeAgo}
                    </Text>
                    <Text
                      fontSize="$1"
                      color="$gray4"
                      fontFamily="$mono"
                      margin={0}
                    >
                      Seq: {transcript.seq}
                    </Text>
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

