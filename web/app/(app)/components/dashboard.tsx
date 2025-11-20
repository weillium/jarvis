'use client';

import {
  YStack,
  XStack,
  Card,
  Anchor,
  EmptyStateCard,
  Heading,
  Body,
  Label,
} from '@jarvis/ui-core';
import { styled } from 'tamagui';

const NavAnchor = styled(Anchor, {
  textDecorationLine: 'none',
});

export default function AppDashboard() {
  return (
    <YStack maxWidth={1400} marginHorizontal="auto" width="100%">
      <YStack marginBottom="$8">
        <Heading level={1} marginBottom="$2" letterSpacing={-0.5}>
          Dashboard
        </Heading>
        <Body size="lg" tone="muted" margin={0}>
          Overview of your events and agents
        </Body>
      </YStack>

      <XStack
        flexWrap="wrap"
        gap="$6"
        marginBottom="$10"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Label size="xs" tone="muted" uppercase letterSpacing={0.5}>
              Active Events
            </Label>
            <Heading level={1} marginBottom="$1">
              {/* Placeholder: Active events count */}
              --
            </Heading>
            <NavAnchor href="/events">
              <Body size="md" color="$blue11" weight="medium">
                View all →
              </Body>
            </NavAnchor>
          </YStack>
        </Card>

        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Label size="xs" tone="muted" uppercase letterSpacing={0.5}>
              Active Agents
            </Label>
            <Heading level={1} marginBottom="$1">
              {/* Placeholder: Active agents count */}
              --
            </Heading>
            <NavAnchor href="/agents">
              <Body size="md" color="$blue11" weight="medium">
                View all →
              </Body>
            </NavAnchor>
          </YStack>
        </Card>

        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Label size="xs" tone="muted" uppercase letterSpacing={0.5}>
              Total Cards Generated
            </Label>
            <Heading level={1} marginBottom="$1">
              {/* Placeholder: Total cards count */}
              --
            </Heading>
            <Body tone="muted">
              All time
            </Body>
          </YStack>
        </Card>
      </XStack>

      <Card>
        <YStack gap="$4">
          <Heading level={3} margin={0}>
            Recent Activity
          </Heading>
          <EmptyStateCard
            title="No recent activity"
            description="Once events start running, you'll see the latest updates here."
            padding="$4"
            borderRadius="$3"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$gray1"
            align="start"
            titleLevel={5}
          />
        </YStack>
      </Card>
    </YStack>
  );
}
