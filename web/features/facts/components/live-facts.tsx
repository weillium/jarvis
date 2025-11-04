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

/**
 * Live Facts Component
 * Displays facts as they are updated via SSE stream
 */
export function LiveFacts({ eventId }: LiveFactsProps) {
  const [facts, setFacts] = useState<Map<string, Fact>>(new Map());

  useSSEStream({
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
  });

  const factsArray = Array.from(facts.values()).sort((a, b) => {
    // Sort by confidence (high first), then by key
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.key.localeCompare(b.key);
  });

  return (
    <div>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: '600',
          color: '#0f172a',
          marginBottom: '16px',
        }}
      >
        Key Facts
      </h2>

      {factsArray.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '14px',
          }}
        >
          No facts tracked yet. Facts will appear as they are extracted during the event.
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

