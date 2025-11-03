'use client';

import type { CardPayload } from '@/shared/types/card';

interface VisualCardProps {
  card: CardPayload;
  timestamp?: string;
}

/**
 * Visual Card Component
 * Displays just an image with a short label
 */
export function VisualCard({ card, timestamp }: VisualCardProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Image */}
      {card.image_url ? (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#f1f5f9',
            marginBottom: '12px',
          }}
        >
          <img
            src={card.image_url}
            alt={card.label || card.title || 'Image'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e) => {
              // Fallback if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            borderRadius: '8px',
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: '14px',
            marginBottom: '12px',
          }}
        >
          No image available
        </div>
      )}

      {/* Label */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#0f172a',
          textAlign: 'center',
        }}
      >
        {card.label || card.title || 'Image'}
      </div>

      {timestamp && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

