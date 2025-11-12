'use client';

import type { CardPayload } from '@/shared/types/card';
import { CardShell } from './card-shell';

interface CardDisplayProps {
  card: CardPayload;
  timestamp?: string;
  onModerate?: () => void;
}

export function CardDisplay({ card, timestamp, onModerate }: CardDisplayProps) {
  const cardType = card.card_type ?? 'text';
  const showImage = (cardType === 'text_visual' || cardType === 'visual') && card.image_url;

  return (
    <CardShell>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: '20px',
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.2,
              color: '#0f172a',
            }}
          >
            {card.title}
          </h3>

          {card.kind && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginTop: '10px',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#4f46e5',
                background: 'rgba(79, 70, 229, 0.12)',
              }}
            >
              {card.kind}
            </span>
          )}
        </div>

        {onModerate && (
          <button
            type="button"
            onClick={onModerate}
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '999px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = '#1e293b';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = '#0f172a';
            }}
          >
            Moderate
          </button>
        )}
      </div>

      {showImage && card.image_url && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: '18px',
            overflow: 'hidden',
            background: '#e2e8f0',
          }}
        >
          <img
            src={card.image_url}
            alt={card.label || card.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(event) => {
              (event.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {card.body && cardType !== 'visual' && (
        <div
          style={{
            fontSize: '16px',
            lineHeight: 1.65,
            color: '#1f2937',
            whiteSpace: 'pre-line',
          }}
        >
          {card.body}
        </div>
      )}

      {card.label && cardType === 'visual' && (
        <div
          style={{
            fontSize: '16px',
            fontWeight: 600,
            textAlign: 'center',
            color: '#0f172a',
          }}
        >
          {card.label}
        </div>
      )}

      {(card.source_seq || timestamp) && (
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#64748b',
            borderTop: '1px solid rgba(100, 116, 139, 0.14)',
            paddingTop: '10px',
          }}
        >
          {card.source_seq && <span>Source #{card.source_seq}</span>}
          {timestamp && <span>{new Date(timestamp).toLocaleTimeString()}</span>}
        </div>
      )}
    </CardShell>
  );
}


