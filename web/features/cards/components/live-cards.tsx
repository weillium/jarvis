'use client';

import { useState, useEffect } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage, SSECardMessage } from '@/shared/types/card';
import { CardDisplay } from './card-display';
import type { CardPayload } from '@/shared/types/card';

interface LiveCardsProps {
  eventId: string;
}

/**
 * Live Cards Component
 * Displays cards as they arrive via SSE stream
 */
export function LiveCards({ eventId }: LiveCardsProps) {
  const [cards, setCards] = useState<Array<{ payload: CardPayload; timestamp: string }>>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const { isConnected, isConnecting, error, reconnect } = useSSEStream({
    eventId,
    onMessage: (message: SSEMessage) => {
      if (message.type === 'card') {
        const cardMessage = message as SSECardMessage;
        setCards((prev) => [
          { payload: cardMessage.payload, timestamp: cardMessage.timestamp },
          ...prev,
        ]);
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
        {cards.length === 0 ? (
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
          cards.map((card, index) => (
            <CardDisplay
              key={`${card.payload.source_seq || index}-${card.timestamp}`}
              card={card.payload}
              timestamp={card.timestamp}
            />
          ))
        )}
      </div>
    </div>
  );
}

