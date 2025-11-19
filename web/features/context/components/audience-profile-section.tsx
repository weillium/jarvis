'use client';

import type { BlueprintAudienceProfile } from './blueprint-display-utils';
import { YStack, XStack, Text, Card } from '@jarvis/ui-core';

interface AudienceProfileSectionProps {
  audienceProfile: BlueprintAudienceProfile;
}

export function AudienceProfileSection({ audienceProfile }: AudienceProfileSectionProps) {
  return (
    <YStack marginBottom="$5">
      <Text fontSize="$3" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
        Audience Profile
      </Text>
      <Card variant="outlined" padding="$4">
        <YStack gap="$3" fontSize="$2" color="$gray9">
          <Text margin={0}>{audienceProfile.audience_summary}</Text>
          <XStack flexWrap="wrap" gap="$1.5">
            {audienceProfile.primary_roles.map((role, idx) => (
              <YStack
                key={`audience-role-${idx}`}
                padding="$1 $2.5"
                backgroundColor="$blue2"
                borderRadius="$2"
              >
                <Text fontSize="$2" color="$blue11" margin={0}>
                  {role}
                </Text>
              </YStack>
            ))}
          </XStack>
          <YStack>
            <Text fontWeight="600" marginBottom="$1" margin={0}>Core Needs</Text>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {audienceProfile.core_needs.map((need, idx) => (
                <li key={`audience-need-${idx}`} style={{ marginBottom: '4px' }}>
                  <Text margin={0}>{need}</Text>
                </li>
              ))}
            </ul>
          </YStack>
          <YStack>
            <Text fontWeight="600" marginBottom="$1" margin={0}>Desired Outcomes</Text>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {audienceProfile.desired_outcomes.map((outcome, idx) => (
                <li key={`audience-outcome-${idx}`} style={{ marginBottom: '4px' }}>
                  <Text margin={0}>{outcome}</Text>
                </li>
              ))}
            </ul>
          </YStack>
          <Text margin={0}>
            <Text fontWeight="600" margin={0}>Tone & Voice:</Text> {audienceProfile.tone_and_voice}
          </Text>
          <YStack>
            <Text fontWeight="600" marginBottom="$1" margin={0}>Cautionary Notes</Text>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {audienceProfile.cautionary_notes.map((note, idx) => (
                <li key={`audience-note-${idx}`} style={{ marginBottom: '4px' }}>
                  <Text margin={0}>{note}</Text>
                </li>
              ))}
            </ul>
          </YStack>
        </YStack>
      </Card>
    </YStack>
  );
}

