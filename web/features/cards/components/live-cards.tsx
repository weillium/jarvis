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
  const scrollAreaRef = useRef<HTMLElement | null>(null);

  const { data: cardsData, isLoading } = useCardsQuery(eventId);

  const cards = useMemo(() => cardsData ?? [], [cardsData]);
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

  // Remove gradient background from scroll area
  useEffect(() => {
    const element = scrollerRef.current as HTMLElement | null;
    if (element) {
      element.style.background = 'transparent';
      element.style.backgroundColor = 'transparent';
      element.style.backgroundImage = 'none';
      // Also check for any CSS variables or computed styles
      const computedStyle = window.getComputedStyle(element);
      if (computedStyle.backgroundImage && computedStyle.backgroundImage !== 'none') {
        element.style.setProperty('background-image', 'none', 'important');
      }
    }
  }, [cards]);

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

  const connectionVariant = connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'error';
  const connectionColor = connectionStatus === 'connected' ? '$green11' : connectionStatus === 'connecting' ? '$yellow11' : '$red11';

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
        variant="ghost"
        onClick={() => handleScroll(direction)}
        width={44}
        height={44}
        borderRadius="$10"
        pointerEvents="auto"
        backgroundColor="transparent"
        borderWidth={0}
        borderColor="transparent"
        shadowColor="transparent"
        shadowOffset={{ width: 0, height: 0 }}
        shadowRadius={0}
        shadowOpacity={0}
        outlineWidth={0}
        outlineColor="transparent"
        hoverStyle={{
          backgroundColor: 'transparent',
        }}
        pressStyle={{
          backgroundColor: 'transparent',
          scale: 1,
          opacity: 1,
        }}
      >
        {direction === 'prev' ? '‹' : '›'}
      </Button>
    </YStack>
  );

  return (
    <YStack padding="$8" backgroundColor="transparent">
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
          <XStack gap="$3" alignItems="center" flexShrink={0}>
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
              <Body size="sm" tone="danger" margin={0}>
                {error.message}
              </Body>
            )}
          </XStack>
        </XStack>
      </Alert>

      {isLoading ? (
        <LoadingState
          title="Loading cards…"
          description="Fetching the latest context cards."
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
          padding="$6"
          titleLevel={5}
          align="center"
        />
      ) : (
        <YStack position="relative" maxWidth="97.5%" marginHorizontal="auto">
          {canScroll && renderScrollButton('prev')}

          {canScroll && renderScrollButton('next')}

          <YStack
            borderRadius="$4"
            borderWidth={1}
            borderColor="$gray4"
            overflow="hidden"
          >
            <HorizontalScrollArea
              ref={scrollerRef}
              shadowColor="transparent"
              shadowOffset={{ width: 0, height: 0 }}
              shadowRadius={0}
              shadowOpacity={0}
              backgroundColor="transparent"
              background="transparent"
              backgroundImage="none"
              paddingLeft="$4"
              style={{
                background: 'transparent !important',
                backgroundImage: 'none !important',
                backgroundColor: 'transparent !important',
              }}
            >
            {cards.map((card) => {
              const payload = card.payload as CardPayload | null;
              if (!payload) {
                return null;
              }

              return (
                <CardDisplay
                  key={card.id}
                  card={payload}
                  timestamp={card.emitted_at}
                  onModerate={() => setModerationCardId(card.id)}
                />
              );
            })}
            </HorizontalScrollArea>
          </YStack>
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
