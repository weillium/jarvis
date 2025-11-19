'use client';

import { YStack, XStack, Text, Card, Anchor, EmptyStateCard } from '@jarvis/ui-core';

export default function AppDashboard() {
  return (
    <YStack maxWidth={1400} marginHorizontal="auto" width="100%">
      <YStack marginBottom="$8">
        <Text
          fontSize="$10"
          fontWeight="700"
          color="$color"
          marginBottom="$2"
          letterSpacing={-0.5}
        >
          Dashboard
        </Text>
        <Text fontSize="$5" color="$gray11" margin={0}>
          Overview of your events and agents
        </Text>
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
            <Text
              fontSize="$3"
              fontWeight="500"
              color="$gray11"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              Active Events
            </Text>
            <Text fontSize="$9" fontWeight="700" color="$color" marginBottom="$1">
              {/* Placeholder: Active events count */}
              --
            </Text>
            <Anchor href="/events" textDecorationLine="none">
              <Text fontSize="$3" color="$blue11" fontWeight="500">
                View all →
              </Text>
            </Anchor>
          </YStack>
        </Card>

        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Text
              fontSize="$3"
              fontWeight="500"
              color="$gray11"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              Active Agents
            </Text>
            <Text fontSize="$9" fontWeight="700" color="$color" marginBottom="$1">
              {/* Placeholder: Active agents count */}
              --
            </Text>
            <Anchor href="/agents" textDecorationLine="none">
              <Text fontSize="$3" color="$blue11" fontWeight="500">
                View all →
              </Text>
            </Anchor>
          </YStack>
        </Card>

        <Card flex={1} minWidth={300}>
          <YStack gap="$2">
            <Text
              fontSize="$3"
              fontWeight="500"
              color="$gray11"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              Total Cards Generated
            </Text>
            <Text fontSize="$9" fontWeight="700" color="$color" marginBottom="$1">
              {/* Placeholder: Total cards count */}
              --
            </Text>
            <Text fontSize="$3" color="$gray11">
              All time
            </Text>
          </YStack>
        </Card>
      </XStack>

      <Card>
        <YStack gap="$4">
          <Text fontSize="$6" fontWeight="600" color="$color" margin={0}>
            Recent Activity
          </Text>
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
