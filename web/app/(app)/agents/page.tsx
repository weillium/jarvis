import { YStack, XStack, Card, Heading, Body, Input, Select, Button, Badge } from '@jarvis/ui-core';

export default function AgentsIndex() {
  return (
    <YStack maxWidth={1400} marginHorizontal="auto" width="100%" gap="$6">
      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$4">
        <YStack gap="$1">
          <Heading level={1}>Agents</Heading>
          <Body tone="muted">Manage your AI context agents</Body>
        </YStack>
        <Button>Create Agent</Button>
      </XStack>

      <Card padding="$0">
        <YStack borderBottomWidth={1} borderBottomColor="$borderColor" padding="$4" gap="$3">
          <Input placeholder="Search agents..." />
          <Select>
            <option>All Status</option>
            <option>Prepping</option>
            <option>Ready</option>
            <option>Running</option>
            <option>Ended</option>
          </Select>
        </YStack>

        <YStack padding="$4">
          <XStack flexWrap="wrap" gap="$4">
            {[1, 2, 3].map((i) => (
              <Card key={i} flex={1} minWidth={300} padding="$4" borderWidth={1} borderColor="$borderColor">
                <YStack gap="$3">
                  <XStack justifyContent="space-between" alignItems="flex-start">
                    <YStack gap="$1">
                      <Heading level={4}>Agent {i}</Heading>
                      <Body tone="muted">Event Name Placeholder</Body>
                    </YStack>
                    <Badge variant="gray">Ready</Badge>
                  </XStack>
                  <Body tone="muted">Context agent for event processing...</Body>
                  <XStack gap="$2">
                    <Button flex={1} variant="outline">
                      View Details
                    </Button>
                    <Button variant="ghost">⋮</Button>
                  </XStack>
                </YStack>
              </Card>
            ))}
          </XStack>
        </YStack>
      </Card>
    </YStack>
  );
}
