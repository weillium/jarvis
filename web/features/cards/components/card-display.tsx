'use client';

import React, { useEffect, useState } from 'react';
import type { CardPayload } from '@/shared/types/card';
import { CardShell } from './card-shell';
import { ClientDateFormatter } from '@/shared/components/client-date-formatter';
import {
  YStack,
  XStack,
  Button,
  Badge,
  Heading,
  Body,
  BulletList,
} from '@jarvis/ui-core';
import { Image, styled } from 'tamagui';

interface CardDisplayProps {
  card: CardPayload;
  timestamp?: string;
  onModerate?: () => void;
  allowShrink?: boolean;
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
    .filter((line) => {
      const lower = line.toLowerCase();
      return (
        Boolean(line) &&
        !lower.startsWith('why now:') &&
        !lower.startsWith('visual prompt:')
      );
    });
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

export const CardDisplay = React.memo(function CardDisplay({
  card,
  timestamp,
  onModerate,
  allowShrink,
}: CardDisplayProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const cardType = card.card_type ?? 'text';
  const templateName = normalizeTemplateName(card);
  const isDefinition = templateName.includes('definition');
  const isSummary = templateName.includes('summary');
  const badgeLabel = card.template_label ?? null;

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
        <Body tone="muted" whitespace="preLine">
          {definition}
        </Body>
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
    <CardShell allowShrink={allowShrink}>
      <YStack flex={1} minHeight={0}>
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
              <Badge variant="purple" size="sm" marginTop="$2" marginBottom="$3">
                {badgeLabel}
              </Badge>
            )}
          </YStack>
        </XStack>

        {cardType === 'visual' && renderImage()}

        {renderContent()}

        {cardType === 'text_visual' && renderImage()}

        {cardType === 'visual' && card.label && (
          <Heading level={5} align="center">
            {card.label}
          </Heading>
        )}

        <XStack
          marginTop="auto"
          justifyContent="space-between"
          alignItems="center"
          gap="$3"
          borderTopWidth={1}
          borderTopColor="$gray4"
          paddingTop="$2.5"
        >
          <XStack flex={1}>
            {card.source_seq && (
              <Body size="sm" tone="muted">
                Source #{card.source_seq}
              </Body>
            )}
          </XStack>
          {onModerate && (
            <Button variant="outline" size="sm" onClick={onModerate}>
              Moderate
            </Button>
          )}
          <XStack flex={1} justifyContent="flex-end">
            {timestamp && (
              <Body size="sm" tone="muted" textAlign="right">
                <ClientDateFormatter date={timestamp} format="localeTimeString" />
              </Body>
            )}
          </XStack>
        </XStack>
      </YStack>
    </CardShell>
  );
}, (prevProps, nextProps) => {
  // Only re-render if card data actually changed
  // Compare card ID and key fields to avoid unnecessary re-renders
  if (prevProps.card.title !== nextProps.card.title) return false;
  if (prevProps.card.body !== nextProps.card.body) return false;
  if (prevProps.card.image_url !== nextProps.card.image_url) return false;
  if (prevProps.card.template_label !== nextProps.card.template_label) return false;
  if (prevProps.timestamp !== nextProps.timestamp) return false;
  if (prevProps.allowShrink !== nextProps.allowShrink) return false;
  // If all key fields are the same, skip re-render
  return true;
});
