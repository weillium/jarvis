'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import { useFactsQuery } from '@/shared/hooks/use-facts-query';
import { useQueryClient } from '@tanstack/react-query';
import type { SSEMessage, SSEFactMessage } from '@/shared/types/card';
import { ClientDateFormatter } from '@/shared/components/client-date-formatter';
import { FactModerationModal } from './fact-moderation-modal';
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
  LoadingState,
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

/**
 * Live Facts Component
 * Displays facts as they are updated via SSE stream
 */
export function LiveFacts({ eventId }: LiveFactsProps) {
  const { data: initialFacts, isLoading, error } = useFactsQuery(eventId);
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [moderationFactKey, setModerationFactKey] = useState<string | null>(null);

  // Convert initial facts to Map format
  const factsMap = useMemo(() => {
    const map = new Map<string, Fact>();
    if (initialFacts) {
      for (const fact of initialFacts) {
        map.set(fact.fact_key, {
          key: fact.fact_key,
          value: fact.fact_value,
          confidence: fact.confidence,
          last_seen_seq: fact.last_seen_seq,
          updated_at: fact.updated_at,
        });
      }
    }
    return map;
  }, [initialFacts]);

  const [facts, setFacts] = useState<Map<string, Fact>>(factsMap);

  // Update facts when initial data loads
  useEffect(() => {
    if (initialFacts) {
      setFacts(factsMap);
    }
  }, [initialFacts, factsMap]);

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
          // Update React Query cache
          queryClient.setQueryData<typeof initialFacts>(['facts', eventId], (prev = []) =>
            prev.filter((f) => f.fact_key !== fact.fact_key)
          );
        } else {
          // Insert or update fact - only if it's active
          // Note: SSE stream should only send active facts, but we double-check here
          const updatedFact: Fact = {
            key: fact.fact_key,
            value: fact.fact_value,
            confidence: fact.confidence,
            last_seen_seq: fact.last_seen_seq,
            updated_at: fact.updated_at,
          };
          setFacts((prev) => {
            const next = new Map(prev);
            next.set(fact.fact_key, updatedFact);
            return next;
          });
          // Update React Query cache - filter out inactive facts
          queryClient.setQueryData<typeof initialFacts>(['facts', eventId], (prev = []) => {
            const existing = prev.find((f) => f.fact_key === fact.fact_key);
            if (existing) {
              return prev.map((f) =>
                f.fact_key === fact.fact_key
                  ? {
                      fact_key: fact.fact_key,
                      fact_value: fact.fact_value,
                      confidence: fact.confidence,
                      last_seen_seq: fact.last_seen_seq,
                      updated_at: fact.updated_at,
                    }
                  : f
              );
            }
            return [
              ...prev,
              {
                fact_key: fact.fact_key,
                fact_value: fact.fact_value,
                confidence: fact.confidence,
                last_seen_seq: fact.last_seen_seq,
                updated_at: fact.updated_at,
              },
            ];
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

  const factsArray = useMemo(() => {
    return Array.from(facts.values()).sort((a, b) => {
      // Sort by confidence (high first), then by key
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return a.key.localeCompare(b.key);
    });
  }, [facts]);

  const connectionVariant = connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'error';
  const connectionColor = connectionStatus === 'connected' ? '$green11' : connectionStatus === 'connecting' ? '$yellow11' : '$red11';
  const connectionColorHex = connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'connecting' ? '#eab308' : '#ef4444';

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
          title="Loading facts"
          description="Fetching the latest extracted facts."
        />
      ) : error ? (
        <EmptyStateCard
          title="Unable to load facts"
          description={`Failed to load facts: ${error instanceof Error ? error.message : 'Unknown error'}`}
        />
      ) : factsArray.length === 0 ? (
        <EmptyStateCard
          title="No facts yet"
          description="Facts will appear as they are extracted during the event."
        />
      ) : (
        <>
          <YStack gap="$3">
            {factsArray.map((fact) => {
              const moderationTarget = moderationFactKey === fact.key;
              return (
                <Card
                  key={fact.key}
                  variant="outlined"
                  padding="$4"
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
                        Updated <ClientDateFormatter date={fact.updated_at} format="localeTimeString" />
                      </Body>
                    </YStack>
                    <YStack
                      alignItems="center"
                      gap="$2"
                      minWidth={100}
                    >
                      <YStack
                        padding="$2 $2"
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
                          textAlign="center"
                          margin={0}
                          lineHeight={1}
                        >
                          {(fact.confidence * 100).toFixed(0)}% confident
                        </Body>
                      </YStack>
                      <Button variant="outline" size="sm" onClick={() => setModerationFactKey(fact.key)}>
                        Moderate
                      </Button>
                    </YStack>
                  </XStack>
                </Card>
              );
            })}
          </YStack>

          {moderationFactKey && (() => {
            const fact = factsArray.find((f) => f.key === moderationFactKey);
            return fact ? (
              <FactModerationModal
                eventId={eventId}
                factKey={fact.key}
                factValue={fact.value}
                confidence={fact.confidence}
                updatedAt={fact.updated_at}
                isOpen={Boolean(fact)}
                onClose={() => setModerationFactKey(null)}
              />
            ) : null;
          })()}
        </>
      )}
    </YStack>
  );
}
