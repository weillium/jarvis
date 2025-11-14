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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: connectionStatus === 'connected' ? 'rgba(34, 197, 94, 0.08)' : connectionStatus === 'connecting' ? 'rgba(250, 204, 21, 0.12)' : 'rgba(248, 113, 113, 0.12)',
          borderRadius: '16px',
          padding: '14px 18px',
          border: `1px solid ${
            connectionStatus === 'connected'
              ? 'rgba(22, 163, 74, 0.3)'
              : connectionStatus === 'connecting'
              ? 'rgba(202, 138, 4, 0.3)'
              : 'rgba(220, 38, 38, 0.3)'
          }`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background:
                connectionStatus === 'connected'
                  ? '#16a34a'
                  : connectionStatus === 'connecting'
                  ? '#ca8a04'
                  : '#dc2626',
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color:
                connectionStatus === 'connected'
                  ? '#166534'
                  : connectionStatus === 'connecting'
                  ? '#854d0e'
                  : '#991b1b',
            }}
          >
            {connectionStatus === 'connected'
              ? 'Connected — receiving live updates'
              : connectionStatus === 'connecting'
              ? 'Connecting to live stream…'
              : 'Disconnected from stream'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {connectionStatus === 'disconnected' && (
            <button
              onClick={reconnect}
              style={{
                padding: '8px 16px',
                borderRadius: '999px',
                background: '#0f172a',
                color: '#f8fafc',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reconnect
            </button>
          )}
          {error && (
            <span
              style={{
                fontSize: '12px',
                color: '#dc2626',
              }}
            >
              {error.message}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div
          style={{
            padding: '64px 24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '15px',
            borderRadius: '20px',
            border: '1px dashed rgba(148, 163, 184, 0.4)',
          }}
        >
          Loading cards…
        </div>
      ) : cards.length === 0 ? (
        <div
          style={{
            padding: '64px 24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '15px',
            borderRadius: '20px',
            border: '1px dashed rgba(148, 163, 184, 0.4)',
          }}
        >
          {connectionStatus === 'connecting'
            ? 'Waiting for connection…'
            : connectionStatus === 'connected'
            ? 'No cards yet. Cards will appear as the event progresses.'
            : 'Disconnected. Click reconnect to try again.'}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {canScroll && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '-32px',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <button
                type="button"
                onClick={() => handleScroll('prev')}
                style={{
                  pointerEvents: 'auto',
                  width: '44px',
                  height: '44px',
                  borderRadius: '999px',
                  border: 'none',
                  background: '#ffffff',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer',
                }}
              >
                ‹
              </button>
            </div>
          )}

          {canScroll && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: '-32px',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <button
                type="button"
                onClick={() => handleScroll('next')}
                style={{
                  pointerEvents: 'auto',
                  width: '44px',
                  height: '44px',
                  borderRadius: '999px',
                  border: 'none',
                  background: '#ffffff',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer',
                }}
              >
                ›
              </button>
            </div>
          )}

          <div
            ref={scrollerRef}
            style={{
              display: 'flex',
              gap: '24px',
              overflowX: 'auto',
              padding: '12px 4px 12px 4px',
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
          </div>
        </div>
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
    </div>
  );
}

