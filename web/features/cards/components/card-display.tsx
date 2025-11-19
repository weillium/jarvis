'use client';

import { formatDistanceToNow } from 'date-fns';
import type { Transcript } from '@/shared/hooks/use-transcripts-query';
import type { CardPayload } from '@/shared/types/card';
import { CardShell } from './card-shell';
import { YStack, XStack, Text, Button, Card } from '@jarvis/ui-core';

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
  const templateSource = card.template_id ?? card.template_label ?? '';
  return templateSource.toLowerCase();
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
  const badgeLabel = card.template_label ?? null;
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
      <YStack
        position="relative"
        width="100%"
        aspectRatio={16 / 9}
        borderRadius="$5"
        overflow="hidden"
        backgroundColor="$gray4"
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
      </YStack>
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
        <Card
          variant="outlined"
          padding="$4"
          borderRadius="$4"
          backgroundColor="$blue2"
          borderColor="$blue4"
        >
          <YStack gap="$2">
            <Text
              fontSize="$2"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.08}
              color="$blue11"
              margin={0}
            >
              Definition
            </Text>
            <Text fontSize="$4" lineHeight={1.6} color="$gray9" margin={0}>
              {definition}
            </Text>
          </YStack>
        </Card>
      );
    }

    if (isSummary) {
      const bullets = extractSummaryBullets(card.body);
      if (bullets.length === 0) {
        return null;
      }
      return (
        <ul style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bullets.map((bullet) => (
            <li key={bullet}>
              <Text fontSize="$4" lineHeight={1.6} color="$gray9" margin={0}>
                {bullet}
              </Text>
            </li>
          ))}
        </ul>
      );
    }

    if (card.body) {
      return (
        <Text
          fontSize="$4"
          lineHeight={1.65}
          color="$gray9"
          whiteSpace="pre-line"
          margin={0}
        >
          {card.body}
        </Text>
      );
    }

    return null;
  };

  return (
    <CardShell>
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="$3"
      >
        <YStack flex={1} minWidth={0}>
          <Text
            fontSize="$5"
            fontWeight="700"
            margin={0}
            lineHeight={1.2}
            color="$color"
          >
            {card.title}
          </Text>

          {badgeLabel && (
            <YStack
              display="inline-flex"
              alignItems="center"
              marginTop="$2.5"
              padding="$1 $2.5"
              borderRadius="$10"
              backgroundColor="$purple2"
            >
              <Text
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.06}
                color="$purple11"
                margin={0}
              >
                {badgeLabel}
              </Text>
            </YStack>
          )}
        </YStack>

        {onModerate && (
          <Button
            variant="primary"
            size="sm"
            onPress={onModerate}
            backgroundColor="$color"
            color="$gray4"
            borderColor="$gray5"
            hoverStyle={{ backgroundColor: '$gray9' }}
          >
            Moderate
          </Button>
        )}
      </XStack>

      {cardType === 'visual' && renderImage()}

      {renderContent()}

      {cardType === 'text_visual' && renderImage()}

      {cardType === 'visual' && card.label && (
        <Text
          fontSize="$4"
          fontWeight="600"
          textAlign="center"
          color="$color"
          margin={0}
        >
          {card.label}
        </Text>
      )}

      {transcript && (
        <Card
          variant="outlined"
          padding="$3.5 $4"
          borderRadius="$4"
          backgroundColor="$gray1"
          borderColor="$gray4"
        >
          <YStack gap="$1.5">
            <Text
              fontSize="$2"
              fontWeight="600"
              textTransform="uppercase"
              letterSpacing={0.08}
              color="$color"
              margin={0}
            >
              Source transcript
            </Text>
            {transcript.speaker && (
              <Text
                fontSize="$2"
                fontWeight="600"
                color="$gray9"
                margin={0}
              >
                {transcript.speaker}
              </Text>
            )}
            <Text
              fontSize="$3"
              lineHeight={1.6}
              color="$gray8"
              whiteSpace="pre-wrap"
              style={{ wordBreak: 'break-word' }}
              margin={0}
            >
              {transcript.text}
            </Text>
            <XStack justifyContent="space-between">
              <Text fontSize="$1" color="$gray11" fontFamily="$mono" margin={0}>
                Seq {transcript.seq}
              </Text>
              {transcriptTimeAgo && (
                <Text fontSize="$1" color="$gray11" fontFamily="$mono" margin={0}>
                  {transcriptTimeAgo}
                </Text>
              )}
            </XStack>
          </YStack>
        </Card>
      )}

      {(card.source_seq || timestamp) && (
        <XStack
          marginTop="auto"
          justifyContent="space-between"
          alignItems="center"
          borderTopWidth={1}
          borderTopColor="$gray4"
          paddingTop="$2.5"
        >
          {card.source_seq && (
            <Text fontSize="$2" color="$gray11" margin={0}>
              Source #{card.source_seq}
            </Text>
          )}
          {timestamp && (
            <Text fontSize="$2" color="$gray11" margin={0}>
              {new Date(timestamp).toLocaleTimeString()}
            </Text>
          )}
        </XStack>
      )}
    </CardShell>
  );
}


