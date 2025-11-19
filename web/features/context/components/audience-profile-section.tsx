'use client';

import type { BlueprintAudienceProfile } from './blueprint-display-utils';
import {
  YStack,
  Card,
  Heading,
  Body,
  Label,
  BulletList,
  TagGroup,
  Badge,
} from '@jarvis/ui-core';

interface AudienceProfileSectionProps {
  audienceProfile: BlueprintAudienceProfile;
}

export function AudienceProfileSection({ audienceProfile }: AudienceProfileSectionProps) {
  return (
    <YStack gap="$3">
      <Heading level={4}>Audience Profile</Heading>
      <Card variant="outlined" padding="$4" gap="$4">
        <Body tone="default">{audienceProfile.audience_summary}</Body>

        <YStack gap="$2">
          <Label size="xs" tone="muted">
            Primary Roles
          </Label>
          <TagGroup>
            {audienceProfile.primary_roles.map((role, idx) => (
              <Badge key={`audience-role-${idx}`} variant="blue" size="sm">
                {role}
              </Badge>
            ))}
          </TagGroup>
        </YStack>

        <YStack gap="$2">
          <Label size="xs" tone="muted">
            Core Needs
          </Label>
          <BulletList items={audienceProfile.core_needs} />
        </YStack>

        <YStack gap="$2">
          <Label size="xs" tone="muted">
            Desired Outcomes
          </Label>
          <BulletList items={audienceProfile.desired_outcomes} />
        </YStack>

        <Body size="sm">
          <Body size="sm" weight="bold">
            Tone &amp; Voice:
          </Body>{' '}
          {audienceProfile.tone_and_voice}
        </Body>

        <YStack gap="$2">
          <Label size="xs" tone="muted">
            Cautionary Notes
          </Label>
          <BulletList items={audienceProfile.cautionary_notes} />
        </YStack>
      </Card>
    </YStack>
  );
}
