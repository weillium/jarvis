'use client';

import type { CardPayload } from '@/shared/types/card';

interface TextCardProps {
  card: CardPayload;
  timestamp?: string;
}

/**
 * Text Card Component
 * Displays a simple definition without supporting visuals
 */
export function TextCard({ card, timestamp }: TextCardProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <h3
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 8px 0',
          }}
        >
          {card.title}
        </h3>
        {card.kind && (
          <span
            style={{
              display: 'inline-block',
              padding: '4px 8px',
              background: '#f1f5f9',
              color: '#64748b',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              textTransform: 'uppercase',
            }}
          >
            {card.kind}
          </span>
        )}
      </div>

      {card.body && (
        <div
          style={{
            fontSize: '15px',
            color: '#334155',
            lineHeight: '1.6',
            whiteSpace: 'pre-line',
          }}
        >
          {card.body}
        </div>
      )}

      {timestamp && (
        <div
          style={{
            marginTop: '12px',
            fontSize: '12px',
            color: '#94a3b8',
          }}
        >
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

