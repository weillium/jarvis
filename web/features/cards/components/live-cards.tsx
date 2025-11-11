'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSECardMessage, SSEMessage, Card } from '@/shared/types/card';
import { CardDisplay } from './card-display';
import type { CardPayload } from '@/shared/types/card';
import { useCardsQuery } from '@/shared/hooks/use-cards-query';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateCardActiveStatusMutation } from '@/shared/hooks/use-mutations';

interface LiveCardsProps {
  eventId: string;
}

/**
 * Live Cards Component
 * Displays cards as they arrive via SSE stream
 */
export function LiveCards({ eventId }: LiveCardsProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [moderatingCardId, setModeratingCardId] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: cardsData, isLoading } = useCardsQuery(eventId);

  const cards = useMemo(() => cardsData ?? [], [cardsData]);
  const updateCardStatus = useUpdateCardActiveStatusMutation(eventId);

  const { isConnected, isConnecting, error, reconnect } = useSSEStream({
    eventId,
    onMessage: (message: SSEMessage) => {
      if (message.type === 'card') {
        const cardMessage = message as SSECardMessage;
        queryClient.setQueryData<Card[]>(['cards', eventId], (previousCards = []) => {
          const cardId =
            cardMessage.id ??
            `live-${eventId}-${cardMessage.timestamp}-${cardMessage.payload.source_seq ?? 'unknown'}`;

          if (cardMessage.is_active === false) {
            return previousCards.filter((card) => card.id !== cardId);
          }

          const alreadyExists = previousCards.some((card) => card.id === cardId);
          if (alreadyExists) {
            return previousCards;
          }

          const nextCard: Card = {
            id: cardId,
            event_id: eventId,
            emitted_at: cardMessage.created_at ?? cardMessage.timestamp,
            kind: cardMessage.payload.kind,
            payload: cardMessage.payload,
            is_active: cardMessage.is_active !== false,
          };

          return [nextCard, ...previousCards];
        });
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

  const handleDeactivate = async (cardId: string) => {
    setModerationError(null);
    setModeratingCardId(cardId);
    try {
      await updateCardStatus.mutateAsync({ cardId, isActive: false });
    } catch (err) {
      console.error('[LiveCards] Failed to deactivate card:', err);
      setModerationError(
        err instanceof Error ? err.message : 'Failed to deactivate card'
      );
    } finally {
      setModeratingCardId(null);
    }
  };

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

      {moderationError && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '13px',
          }}
        >
          {moderationError}
        </div>
      )}

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
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleDeactivate(card.id)}
                    disabled={moderatingCardId === card.id}
                    style={{
                      padding: '6px 12px',
                      background: '#f97316',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: moderatingCardId === card.id ? 'not-allowed' : 'pointer',
                      opacity: moderatingCardId === card.id ? 0.6 : 1,
                    }}
                  >
                    {moderatingCardId === card.id ? 'Deactivating…' : 'Deactivate'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

