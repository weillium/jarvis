'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type {
  SSEMessage,
  Card as CardType,
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
import {
  YStack,
  XStack,
  Button,
  Card,
  Alert,
  Badge,
  Body,
  HorizontalScrollArea,
  EmptyStateCard,
  LoadingState,
} from '@jarvis/ui-core';
import type { TamaguiElement } from 'tamagui';

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
  const scrollerRef = useRef<TamaguiElement | null>(null);

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
    queryClient.setQueryData<CardType[]>(['cards', eventId], (previousCards = []) => {
      const existingIndex = previousCards.findIndex((existing) => existing.id === card.id);
      const mappedCard: CardType = {
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
    queryClient.setQueryData<CardType[]>(['cards', eventId], (previousCards = []) =>
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
    const container = scrollerRef.current as HTMLElement | null;
    if (!container) {
      return;
    }

    const firstCard = container.querySelector<HTMLElement>('[data-card-shell]');
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 360;
    const gap = 24;
    container.scrollBy({
      left: (cardWidth + gap) * (direction === 'next' ? 1 : -1),
      behavior: 'smooth',
    });
  };

  const connectionTheme = {
    connected: {
      background: '$green2',
      border: '$green4',
      color: '$green11',
      label: 'Connected — receiving live updates',
    },
    connecting: {
      background: '$yellow2',
      border: '$yellow4',
      color: '$yellow11',
      label: 'Connecting to live stream…',
    },
    disconnected: {
      background: '$red2',
      border: '$red4',
      color: '$red11',
      label: 'Disconnected from stream',
    },
  } as const;

  const connectionVisuals = connectionTheme[connectionStatus] ?? connectionTheme.disconnected;

  const renderScrollButton = (direction: 'prev' | 'next') => (
    <YStack
      position="absolute"
      top="50%"
      marginTop={-22}
      left={direction === 'prev' ? -32 : undefined}
      right={direction === 'next' ? -32 : undefined}
      alignItems="center"
      justifyContent="center"
      pointerEvents="none"
    >
      <Button
        variant="outline"
        onClick={() => handleScroll(direction)}
        width={44}
        height={44}
        borderRadius="$10"
        pointerEvents="auto"
        backgroundColor="$background"
        shadowColor="$shadowColor"
        shadowOffset={{ width: 0, height: 10 }}
        shadowRadius={30}
        shadowOpacity={0.18}
      >
        {direction === 'prev' ? '‹' : '›'}
      </Button>
    </YStack>
  );

  return (
    <YStack gap="$6">
      <Card
        variant="outlined"
        padding="$3.5 $4.5"
        borderRadius="$4"
        backgroundColor={connectionVisuals.background}
        borderColor={connectionVisuals.border}
      >
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$3">
            <Badge
              variant={connectionStatus === 'connected' ? 'green' : connectionStatus === 'connecting' ? 'yellow' : 'red'}
              size="sm"
            >
              {connectionStatus.toUpperCase()}
            </Badge>
            <Body size="md" weight="medium" color={connectionVisuals.color}>
              {connectionVisuals.label}
            </Body>
          </XStack>
          <XStack gap="$3" alignItems="center">
            {connectionStatus === 'disconnected' && (
              <Button
                variant="primary"
                size="sm"
                onClick={reconnect}
              >
                Reconnect
              </Button>
            )}
            {error && (
              <Body size="sm" tone="danger">
                {error.message}
              </Body>
            )}
          </XStack>
        </XStack>
      </Card>

      {isLoading ? (
        <LoadingState
          title="Loading cards…"
          description="Fetching the latest context cards."
          padding="$16 $6"
          skeletons={[{ height: 320 }, { height: 320 }]}
        />
      ) : cards.length === 0 ? (
        <EmptyStateCard
          title={
            connectionStatus === 'connected'
              ? 'No cards yet'
              : connectionStatus === 'connecting'
              ? 'Waiting for connection…'
              : 'Disconnected'
          }
          description={
            connectionStatus === 'connecting'
              ? 'Holding until the live stream finishes connecting.'
              : connectionStatus === 'connected'
              ? 'Cards will appear as soon as they are generated.'
              : 'Click reconnect to try again.'
          }
          padding="$16 $6"
          borderRadius="$5"
          borderStyle="dashed"
          borderColor="$gray4"
        />
      ) : (
        <YStack position="relative">
          {canScroll && renderScrollButton('prev')}

          {canScroll && renderScrollButton('next')}

          <HorizontalScrollArea ref={scrollerRef}>
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
          </HorizontalScrollArea>
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
