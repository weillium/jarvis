'use client';

import { useState, useEffect } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage, SSEFactMessage } from '@/shared/types/card';
import {
  YStack,
  XStack,
  Text,
  Button,
  Card,
  Alert,
  Badge,
  Body,
  EmptyStateCard,
} from '@jarvis/ui-core';

interface LiveFactsProps {
  eventId: string;
}

interface Fact {
  key: string;
  value: any;
  confidence: number;
  last_seen_seq: number;
  updated_at: string;
}

interface ApiFact {
  fact_key: string;
  fact_value: any;
  confidence: number;
  last_seen_seq: number;
  updated_at: string;
}

/**
 * Live Facts Component
 * Displays facts as they are updated via SSE stream
 */
export function LiveFacts({ eventId }: LiveFactsProps) {
  const [facts, setFacts] = useState<Map<string, Fact>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadInitialFacts = async () => {
      try {
        setInitialLoadError(null);

        const response = await fetch(`/api/context/${eventId}/facts`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Failed to load facts (status ${response.status})`);
        }

        const data: { ok: boolean; facts?: ApiFact[]; error?: string } = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to load facts');
        }

        if (isCancelled) {
          return;
        }

        const nextFacts = new Map<string, Fact>();
        for (const fact of data.facts ?? []) {
          nextFacts.set(fact.fact_key, {
            key: fact.fact_key,
            value: fact.fact_value,
            confidence: fact.confidence,
            last_seen_seq: fact.last_seen_seq,
            updated_at: fact.updated_at,
          });
        }

        setFacts(nextFacts);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        console.error('[LiveFacts] Failed to load initial facts:', error);
        setInitialLoadError(error instanceof Error ? error.message : 'Failed to load facts');
      }
    };

    void loadInitialFacts();

    return () => {
      isCancelled = true;
    };
  }, [eventId]);

  const { isConnected, isConnecting, reconnect } = useSSEStream({
    eventId,
    onMessage: (message: SSEMessage) => {
      if (message.type === 'fact_update') {
        const factMessage = message as SSEFactMessage;
        const fact = factMessage.payload;

        if (factMessage.event === 'DELETE') {
          // Remove fact
          setFacts((prev) => {
            const next = new Map(prev);
            next.delete(fact.fact_key);
            return next;
          });
        } else {
          // Insert or update fact
          setFacts((prev) => {
            const next = new Map(prev);
            next.set(fact.fact_key, {
              key: fact.fact_key,
              value: fact.fact_value,
              confidence: fact.confidence,
              last_seen_seq: fact.last_seen_seq,
              updated_at: fact.updated_at,
            });
            return next;
          });
        }
      }
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

  const factsArray = Array.from(facts.values()).sort((a, b) => {
    // Sort by confidence (high first), then by key
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.key.localeCompare(b.key);
  });

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
              onClick={reconnect}
            >
              Reconnect
            </Button>
          )}
        </XStack>
      </Alert>

      {factsArray.length === 0 ? (
        <EmptyStateCard
          title={initialLoadError ? 'Unable to load facts' : 'No facts yet'}
          description={
            initialLoadError
              ? `Failed to load facts: ${initialLoadError}`
              : 'Facts will appear as they are extracted during the event.'
          }
          padding="$16 $6"
          borderRadius="$5"
          borderStyle="dashed"
          borderColor="$gray4"
        />
      ) : (
        <YStack gap="$3">
          {factsArray.map((fact) => (
              <Card
                key={fact.key}
                variant="outlined"
                padding="$4"
                marginBottom="$3"
              >
                <XStack
                  justifyContent="space-between"
                  alignItems="flex-start"
                  gap="$4"
                >
                  <YStack flex={1} gap="$2">
                    <Body
                      size="md"
                      weight="bold"
                      color="$color"
                      transform="capitalize"
                      margin={0}
                    >
                      {fact.key.replace(/_/g, ' ')}
                    </Body>
                    <Body tone="muted" whitespace="preWrap" mono={typeof fact.value !== 'string'}>
                      {typeof fact.value === 'string'
                        ? fact.value
                        : JSON.stringify(fact.value, null, 2)}
                    </Body>
                    <Body size="sm" tone="muted">
                      Updated {new Date(fact.updated_at).toLocaleTimeString()}
                    </Body>
                  </YStack>
                  <YStack
                    padding="$1 $2"
                    backgroundColor={
                      fact.confidence >= 0.7
                        ? '$green2'
                        : fact.confidence >= 0.5
                        ? '$yellow2'
                        : '$red2'
                    }
                    borderRadius="$2"
                    alignItems="center"
                    justifyContent="center"
                    minWidth={100}
                  >
                    <Body
                      size="sm"
                      weight="medium"
                      color={
                        fact.confidence >= 0.7
                          ? '$green11'
                          : fact.confidence >= 0.5
                          ? '$yellow11'
                          : '$red11'
                      }
                    >
                      {(fact.confidence * 100).toFixed(0)}% confident
                    </Body>
                  </YStack>
                </XStack>
              </Card>
            ))}
        </YStack>
      )}
    </YStack>
  );
}
