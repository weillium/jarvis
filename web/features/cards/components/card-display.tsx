'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Transcript } from '@/shared/hooks/use-transcripts-query';
import type { CardPayload } from '@/shared/types/card';
import { CardShell } from './card-shell';
import {
  YStack,
  XStack,
  Button,
  Card,
  Badge,
  Heading,
  Body,
  Label,
  Caption,
  BulletList,
} from '@jarvis/ui-core';
import { Image, styled } from 'tamagui';

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

const CardMedia = styled(Image, {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export function CardDisplay({
  card,
  timestamp,
  onModerate,
  transcript,
}: CardDisplayProps) {
  const [imageFailed, setImageFailed] = useState(false);
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

  useEffect(() => {
    setImageFailed(false);
  }, [card.image_url]);

  const renderImage = () => {
    if (!card.image_url || imageFailed) {
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
        <CardMedia
          source={{ uri: card.image_url }}
          accessibilityLabel={card.label || card.title || 'Card media'}
          onError={() => setImageFailed(true)}
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
            <Label size="xs" tone="info" uppercase>
              Definition
            </Label>
            <Body tone="muted">
              {definition}
            </Body>
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
        <BulletList
          items={bullets}
          renderItem={(bullet) => (
            <Body tone="muted">
              {bullet}
            </Body>
          )}
        />
      );
    }

    if (card.body) {
      return (
        <Body tone="muted" whitespace="preLine">
          {card.body}
        </Body>
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
          <Heading level={4} margin={0}>
            {card.title}
          </Heading>

          {badgeLabel && (
            <Badge variant="purple" size="sm" marginTop="$2">
              {badgeLabel}
            </Badge>
          )}
        </YStack>

        {onModerate && (
          <Button variant="outline" size="sm" onClick={onModerate}>
            Moderate
          </Button>
        )}
      </XStack>

      {cardType === 'visual' && renderImage()}

      {renderContent()}

      {cardType === 'text_visual' && renderImage()}

      {cardType === 'visual' && card.label && (
        <Heading level={5} align="center">
          {card.label}
        </Heading>
      )}

      {transcript && (
        <Card variant="outlined" padding="$3.5 $4" borderRadius="$4" backgroundColor="$gray1">
          <YStack gap="$1.5">
            <Label size="xs" uppercase>
              Source transcript
            </Label>
            {transcript.speaker && (
              <Body size="sm" weight="medium">
                {transcript.speaker}
              </Body>
            )}
            <Body tone="muted" whitespace="preWrap">
              {transcript.text}
            </Body>
            <XStack justifyContent="space-between">
              <Caption mono>
                Seq {transcript.seq}
              </Caption>
              {transcriptTimeAgo && (
                <Caption mono>
                  {transcriptTimeAgo}
                </Caption>
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
            <Body size="sm" tone="muted">
              Source #{card.source_seq}
            </Body>
          )}
          {timestamp && (
            <Body size="sm" tone="muted">
              {new Date(timestamp).toLocaleTimeString()}
            </Body>
          )}
        </XStack>
      )}
    </CardShell>
  );
}
