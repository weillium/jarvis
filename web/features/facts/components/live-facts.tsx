'use client';

import { useState, useEffect } from 'react';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage, SSEFactMessage } from '@/shared/types/card';

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
      </div>

      {factsArray.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '14px',
          }}
        >
          {initialLoadError
            ? `Failed to load facts: ${initialLoadError}`
            : 'No facts tracked yet. Facts will appear as they are extracted during the event.'}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '12px',
          }}
        >
          {factsArray.map((fact) => (
            <div
              key={fact.key}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#0f172a',
                    marginBottom: '4px',
                    textTransform: 'capitalize',
                  }}
                >
                  {fact.key.replace(/_/g, ' ')}
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    color: '#334155',
                    lineHeight: '1.5',
                  }}
                >
                  {typeof fact.value === 'string'
                    ? fact.value
                    : JSON.stringify(fact.value, null, 2)}
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#94a3b8',
                  }}
                >
                  Updated {new Date(fact.updated_at).toLocaleTimeString()}
                </div>
              </div>
              <div
                style={{
                  marginLeft: '16px',
                  padding: '4px 8px',
                  background: fact.confidence >= 0.7 ? '#f0fdf4' : fact.confidence >= 0.5 ? '#fffbeb' : '#fef2f2',
                  color: fact.confidence >= 0.7 ? '#166534' : fact.confidence >= 0.5 ? '#854d0e' : '#991b1b',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {(fact.confidence * 100).toFixed(0)}% confident
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

