'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { CardDisplay } from './card-display';
import type { CardPayload } from '@/shared/types/card';
import { useCardsQuery } from '@/shared/hooks/use-cards-query';
import { useQueryClient } from '@tanstack/react-query';
import { CardModerationPanel } from './card-moderation-panel';

interface LiveCardsProps {
  eventId: string;
}

/**
 * Live Cards Component
 * Displays cards as they arrive via SSE stream
 */
export function LiveCards({ eventId }: LiveCardsProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const queryClient = useQueryClient();

  const { data: cardsData, isLoading } = useCardsQuery(eventId);

  const cards = useMemo(() => cardsData ?? [], [cardsData]);

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

  return (
    <div>
      {/* Connection Status */}
      <div
        style={{
          marginBottom: '20px',
          padding: '12px 16px',
          background: connectionStatus === 'connected' ? '#f0fdf4' : connectionStatus === 'connecting' ? '#fffbeb' : '#fef2f2',
          border: `1px solid ${connectionStatus === 'connected' ? '#86efac' : connectionStatus === 'connecting' ? '#fde047' : '#fca5a5'}`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'connecting' ? '#eab308' : '#ef4444',
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: connectionStatus === 'connected' ? '#166534' : connectionStatus === 'connecting' ? '#854d0e' : '#991b1b',
            }}
          >
            {connectionStatus === 'connected'
              ? 'Connected - Receiving live updates'
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
          </span>
        </div>
        {connectionStatus === 'disconnected' && (
          <button
            onClick={reconnect}
            style={{
              padding: '6px 12px',
              background: '#1e293b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        )}
        {error && (
          <span style={{ fontSize: '12px', color: '#ef4444', marginLeft: '12px' }}>
            {error.message}
          </span>
        )}
      </div>

      {/* Cards List */}
      <div>
        {isLoading ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '14px',
            }}
          >
            Loading cards...
          </div>
        ) : cards.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '14px',
            }}
          >
            {connectionStatus === 'connecting'
              ? 'Waiting for connection...'
              : connectionStatus === 'connected'
              ? 'No cards yet. Waiting for updates...'
              : 'Disconnected. Click reconnect to try again.'}
          </div>
        ) : (
          cards.map((card) => {
            const payload = card.payload as CardPayload | null;
            if (!payload) {
              return null;
            }

            return (
              <div
                key={card.id}
                style={{
                  marginBottom: '16px',
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <CardDisplay card={payload} timestamp={card.emitted_at} />
                <CardModerationPanel eventId={eventId} cardId={card.id} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

