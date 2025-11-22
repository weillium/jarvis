'use client';

import type { BlueprintAgentAlignment } from '@/shared/hooks/use-blueprint-full-query';
import {
  YStack,
  XStack,
  Card,
  Heading,
  Label,
  BulletList,
  EmptyStateCard,
  Badge,
} from '@jarvis/ui-core';

interface AgentAlignmentSectionProps {
  agentAlignment: BlueprintAgentAlignment;
}

export function AgentAlignmentSection({ agentAlignment }: AgentAlignmentSectionProps) {
  return (
    <YStack gap="$3">
      <Heading level={4}>Agent Alignment</Heading>
      <XStack
        gap="$4"
      >
        <Card variant="outlined" padding="$3" flex={1} width="50%" gap="$3">
          <Badge variant="blue" size="sm">Facts Agent</Badge>
          <YStack gap="$3">
            <YStack gap="$1">
              <Label size="xs">Highlights</Label>
              <BulletList
                items={agentAlignment.facts?.highlights ?? []}
                emptyMessage={
                  <EmptyStateCard
                    title="No highlights captured"
                    padding="$2"
                    borderWidth={0}
                    backgroundColor="transparent"
                    align="start"
                    titleLevel={5}
                  />
                }
              />
            </YStack>
            <YStack gap="$1">
              <Label size="xs">Open Questions</Label>
              <BulletList
                items={agentAlignment.facts?.open_questions ?? []}
                emptyMessage={
                  <EmptyStateCard
                    title="No open questions"
                    padding="$2"
                    borderWidth={0}
                    backgroundColor="transparent"
                    align="start"
                    titleLevel={5}
                  />
                }
              />
            </YStack>
          </YStack>
        </Card>
        <Card variant="outlined" padding="$3" flex={1} width="50%" gap="$3">
          <Badge variant="purple" size="sm">Cards Agent</Badge>
          <YStack gap="$3">
            <YStack gap="$1">
              <Label size="xs">Assets</Label>
              <BulletList
                items={agentAlignment.cards?.assets ?? []}
                emptyMessage={
                  <EmptyStateCard
                    title="No assets identified"
                    padding="$2"
                    borderWidth={0}
                    backgroundColor="transparent"
                    align="start"
                    titleLevel={5}
                  />
                }
              />
            </YStack>
            <YStack gap="$1">
              <Label size="xs">Open Questions</Label>
              <BulletList
                items={agentAlignment.cards?.open_questions ?? []}
                emptyMessage={
                  <EmptyStateCard
                    title="No open questions"
                    padding="$2"
                    borderWidth={0}
                    backgroundColor="transparent"
                    align="start"
                    titleLevel={5}
                  />
                }
              />
            </YStack>
          </YStack>
        </Card>
      </XStack>
    </YStack>
  );
}
