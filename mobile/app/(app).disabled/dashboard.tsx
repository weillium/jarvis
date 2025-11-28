import {
  YStack,
  XStack,
  Card,
  Heading,
  Body,
  Label,
} from '@jarvis/ui-core';
import { router } from 'expo-router';

export default function AppDashboard() {
  return (
    <YStack maxWidth={1400} marginHorizontal="auto" width="100%" padding="$6">
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
      >
        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Label size="xs" tone="muted" uppercase letterSpacing={0.5}>
              Active Events
            </Label>
            <Heading level={1} marginBottom="$1">
              --
            </Heading>
            <Body size="md" color="$blue11" weight="medium" onPress={() => router.push('/(app)/events')}>
              View all →
            </Body>
          </YStack>
        </Card>

        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Label size="xs" tone="muted" uppercase letterSpacing={0.5}>
              Active Agents
            </Label>
            <Heading level={1} marginBottom="$1">
              --
            </Heading>
            <Body size="md" color="$blue11" weight="medium">
              View all →
            </Body>
          </YStack>
        </Card>

        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Label size="xs" tone="muted" uppercase letterSpacing={0.5}>
              Total Cards Generated
            </Label>
            <Heading level={1} marginBottom="$1">
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
          <Body tone="muted">
            Once events start running, you'll see the latest updates here.
          </Body>
        </YStack>
      </Card>
    </YStack>
  );
}

