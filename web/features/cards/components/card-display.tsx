'use client';

import { formatDistanceToNow } from 'date-fns';
import type { Transcript } from '@/shared/hooks/use-transcripts-query';
import type { CardPayload } from '@/shared/types/card';
import { CardShell } from './card-shell';

interface CardDisplayProps {
  card: CardPayload;
  timestamp?: string;
  onModerate?: () => void;
  transcript?: Transcript | null;
}

const stripBullet = (line: string): string =>
  line.replace(/^[•\-\*\u2022]\s*/, '').trim();

const extractDefinition = (body?: string | null): string | null => {
  if (!body) {
    return null;
  }
  const lines = body
    .split(/\n+/)
    .map((line) => stripBullet(line))
    .filter(Boolean);
  for (const line of lines) {
    if (line.toLowerCase().startsWith('definition:')) {
      return line.replace(/^definition:\s*/i, '').trim();
    }
  }
  return lines.length > 0 ? lines[0] : body.trim();
};

const extractSummaryBullets = (body?: string | null): string[] => {
  if (!body) {
    return [];
  }
  return body
    .split(/\n+/)
    .map((line) => stripBullet(line))
    .map((line) => line.replace(/^summary:\s*/i, '').trim())
    .filter(Boolean);
};

const normalizeTemplateName = (card: CardPayload): string => {
  const templateId = card.template_id ?? card.template_label ?? card.kind ?? '';
  return templateId.toLowerCase();
};

export function CardDisplay({
  card,
  timestamp,
  onModerate,
  transcript,
}: CardDisplayProps) {
  const cardType = card.card_type ?? 'text';
  const templateName = normalizeTemplateName(card);
  const isDefinition = templateName.includes('definition');
  const isSummary = templateName.includes('summary');
  const transcriptTimestamp =
    typeof transcript?.at_ms === 'number' ? new Date(transcript.at_ms) : null;
  const transcriptTimeAgo =
    transcriptTimestamp && Number.isFinite(transcriptTimestamp.getTime())
      ? formatDistanceToNow(transcriptTimestamp, { addSuffix: true })
      : null;

  const renderImage = () => {
    if (!card.image_url) {
      return null;
    }
    return (
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
    );
  };

  const renderContent = () => {
    if (cardType === 'visual') {
      return null;
    }

    if (isDefinition) {
      const definition = extractDefinition(card.body);
      if (!definition) {
        return null;
      }
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.16)',
            color: '#1f2937',
            fontSize: '16px',
            lineHeight: 1.6,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#1d4ed8',
            }}
          >
            Definition
          </span>
          <span>{definition}</span>
        </div>
      );
    }

    if (isSummary) {
      const bullets = extractSummaryBullets(card.body);
      if (bullets.length === 0) {
        return null;
      }
      return (
        <ul
          style={{
            margin: 0,
            padding: '0 0 0 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#1f2937',
          }}
        >
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      );
    }

    if (card.body) {
      return (
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
      );
    }

    return null;
  };

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

      {cardType === 'visual' && renderImage()}

      {renderContent()}

      {cardType === 'text_visual' && renderImage()}

      {cardType === 'visual' && card.label && (
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

      {transcript && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '16px',
            background: '#f8fafc',
            border: '1px solid rgba(148, 163, 184, 0.24)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#0f172a',
            }}
          >
            Source transcript
          </div>
          {transcript.speaker && (
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
              }}
            >
              {transcript.speaker}
            </div>
          )}
          <div
            style={{
              fontSize: '15px',
              lineHeight: 1.6,
              color: '#334155',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {transcript.text}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
              fontFamily: 'monospace',
            }}
          >
            <span>Seq {transcript.seq}</span>
            {transcriptTimeAgo && <span>{transcriptTimeAgo}</span>}
          </div>
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


