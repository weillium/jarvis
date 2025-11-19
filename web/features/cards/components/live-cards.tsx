'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type {
  SSEMessage,
  Card,
  CardSnapshot,
  SSECardCreatedMessage,
  SSECardUpdatedMessage,
  SSECardDeactivatedMessage,
  SSECardDeletedMessage,
} from '@/shared/types/card';
import type { CardPayload } from '@/shared/types/card';
import { useCardsQuery } from '@/shared/hooks/use-cards-query';
import { useQueryClient } from '@tanstack/react-query';
import { CardModerationModal } from './card-moderation-modal';
import { useTranscriptsQuery, type Transcript } from '@/shared/hooks/use-transcripts-query';
import { CardDisplay } from './card-display';
import { YStack, XStack, Text, Button, Card, Alert } from '@jarvis/ui-core';

interface LiveCardsProps {
  eventId: string;
}

/**
 * Live Cards Component
 * Displays cards as they arrive via SSE stream
 */
export function LiveCards({ eventId }: LiveCardsProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [moderationCardId, setModerationCardId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const { data: cardsData, isLoading } = useCardsQuery(eventId);

  const { data: transcriptsData } = useTranscriptsQuery(eventId);
  const cards = useMemo(() => cardsData ?? [], [cardsData]);
  const transcriptBySeq = useMemo(() => {
    const map = new Map<number, Transcript>();
    const transcripts = transcriptsData?.transcripts ?? [];
    for (const transcript of transcripts) {
      map.set(transcript.seq, transcript);
    }
    return map;
  }, [transcriptsData?.transcripts]);
  const canScroll = cards.length > 1;
  const moderationTarget = useMemo(() => {
    if (!moderationCardId) {
      return null;
    }
    return cards.find((card) => card.id === moderationCardId) ?? null;
  }, [cards, moderationCardId]);
  const moderationTargetPayload = useMemo(() => {
    const payload = moderationTarget?.payload as CardPayload | null | undefined;
    return payload ?? null;
  }, [moderationTarget]);

  const upsertCard = (card: CardSnapshot) => {
    queryClient.setQueryData<Card[]>(['cards', eventId], (previousCards = []) => {
      const existingIndex = previousCards.findIndex((existing) => existing.id === card.id);
      const mappedCard: Card = {
        id: card.id,
        event_id: card.event_id,
        emitted_at: card.created_at,
        kind: card.card_kind,
        payload: card.payload,
        is_active: card.is_active,
        card_type: typeof card.card_type === 'string' ? card.card_type : null,
        updated_at: card.updated_at ?? undefined,
        last_seen_seq: typeof card.last_seen_seq === 'number' ? card.last_seen_seq : null,
      };

      if (existingIndex === -1) {
        return [mappedCard, ...previousCards];
      }

      const nextCards = [...previousCards];
      nextCards[existingIndex] = { ...nextCards[existingIndex], ...mappedCard };
      return nextCards;
    });
  };

  const removeCard = (cardId: string) => {
    queryClient.setQueryData<Card[]>(['cards', eventId], (previousCards = []) =>
      previousCards.filter((card) => card.id !== cardId)
    );
  };

  const { isConnected, isConnecting, error, reconnect } = useSSEStream({
    eventId,
    onMessage: (message: SSEMessage) => {
      switch (message.type) {
        case 'card_created': {
          const { card } = message as SSECardCreatedMessage;
          upsertCard(card);
          break;
        }
        case 'card_updated': {
          const { card } = message as SSECardUpdatedMessage;
          upsertCard(card);
          break;
        }
        case 'card_deactivated': {
          const { card_id } = message as SSECardDeactivatedMessage;
          removeCard(card_id);
          break;
        }
        case 'card_deleted': {
          const { card_id } = message as SSECardDeletedMessage;
          removeCard(card_id);
          break;
        }
        default:
          break;
      }
    },
    onConnect: () => {
      setConnectionStatus('connected');
    },
    onDisconnect: () => {
      setConnectionStatus('disconnected');
    },
    onError: (err) => {
      console.error('[LiveCards] SSE error:', err);
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

  const handleScroll = (direction: 'prev' | 'next') => {
    if (!scrollerRef.current) {
      return;
    }

    const firstCard = scrollerRef.current.querySelector<HTMLElement>('[data-card-shell]');
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 360;
    const gap = 24;
    scrollerRef.current.scrollBy({
      left: (cardWidth + gap) * (direction === 'next' ? 1 : -1),
      behavior: 'smooth',
    });
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '$green11';
      case 'connecting':
        return '$yellow11';
      case 'disconnected':
        return '$red11';
      default:
        return '$gray11';
    }
  };

  const getConnectionStatusBgColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '$green2';
      case 'connecting':
        return '$yellow2';
      case 'disconnected':
        return '$red2';
      default:
        return '$gray2';
    }
  };

  const getConnectionStatusBorderColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '$green4';
      case 'connecting':
        return '$yellow4';
      case 'disconnected':
        return '$red4';
      default:
        return '$gray4';
    }
  };

  return (
    <YStack gap="$6">
      <Card
        variant="outlined"
        padding="$3.5 $4.5"
        borderRadius="$4"
        backgroundColor={getConnectionStatusBgColor()}
        borderColor={getConnectionStatusBorderColor()}
      >
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$3">
            <YStack
              width={10}
              height={10}
              borderRadius="$10"
              backgroundColor={getConnectionStatusColor()}
            />
            <Text
              fontSize="$3"
              fontWeight="600"
              color={getConnectionStatusColor()}
              margin={0}
            >
              {connectionStatus === 'connected'
                ? 'Connected — receiving live updates'
                : connectionStatus === 'connecting'
                ? 'Connecting to live stream…'
                : 'Disconnected from stream'}
            </Text>
          </XStack>
          <XStack gap="$3" alignItems="center">
            {connectionStatus === 'disconnected' && (
              <Button
                variant="primary"
                size="sm"
                onPress={reconnect}
                backgroundColor="$color"
                color="$gray1"
              >
                Reconnect
              </Button>
            )}
            {error && (
              <Text fontSize="$2" color="$red11" margin={0}>
                {error.message}
              </Text>
            )}
          </XStack>
        </XStack>
      </Card>

      {isLoading ? (
        <Card
          variant="outlined"
          padding="$16 $6"
          borderRadius="$5"
          borderStyle="dashed"
          borderColor="$gray4"
        >
          <Text textAlign="center" color="$gray5" fontSize="$3" margin={0}>
            Loading cards…
          </Text>
        </Card>
      ) : cards.length === 0 ? (
        <Card
          variant="outlined"
          padding="$16 $6"
          borderRadius="$5"
          borderStyle="dashed"
          borderColor="$gray4"
        >
          <Text textAlign="center" color="$gray5" fontSize="$3" margin={0}>
            {connectionStatus === 'connecting'
              ? 'Waiting for connection…'
              : connectionStatus === 'connected'
              ? 'No cards yet. Cards will appear as the event progresses.'
              : 'Disconnected. Click reconnect to try again.'}
          </Text>
        </Card>
      ) : (
        <YStack position="relative">
          {canScroll && (
            <YStack
              position="absolute"
              top="50%"
              left={-32}
              style={{ transform: 'translateY(-50%)' }}
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
            >
              <Button
                variant="primary"
                onPress={() => handleScroll('prev')}
                width={44}
                height={44}
                borderRadius="$10"
                backgroundColor="$background"
                color="$gray9"
                style={{
                  pointerEvents: 'auto',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
                }}
              >
                ‹
              </Button>
            </YStack>
          )}

          {canScroll && (
            <YStack
              position="absolute"
              top="50%"
              right={-32}
              style={{ transform: 'translateY(-50%)' }}
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
            >
              <Button
                variant="primary"
                onPress={() => handleScroll('next')}
                width={44}
                height={44}
                borderRadius="$10"
                backgroundColor="$background"
                color="$gray9"
                style={{
                  pointerEvents: 'auto',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
                }}
              >
                ›
              </Button>
            </YStack>
          )}

          <XStack
            ref={scrollerRef}
            gap="$6"
            overflowX="auto"
            padding="$3 $1"
            style={{
              scrollSnapType: 'x mandatory',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {cards.map((card) => {
              const payload = card.payload as CardPayload | null;
              if (!payload) {
                return null;
              }
              const transcript =
                typeof payload.source_seq === 'number'
                  ? transcriptBySeq.get(payload.source_seq) ?? null
                  : null;

              return (
                <CardDisplay
                  key={card.id}
                  card={payload}
                  timestamp={card.emitted_at}
                  onModerate={() => setModerationCardId(card.id)}
                  transcript={transcript}
                />
              );
            })}
          </XStack>
        </YStack>
      )}

      {moderationTarget && moderationTargetPayload && (
        <CardModerationModal
          eventId={eventId}
          cardId={moderationTarget.id}
          cardPayload={moderationTargetPayload}
          timestamp={moderationTarget.emitted_at}
          isOpen={Boolean(moderationTarget)}
          onClose={() => setModerationCardId(null)}
        />
      )}
    </YStack>
  );
}

