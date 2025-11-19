'use client';

import type { BlueprintAgentAlignment } from '@/shared/hooks/use-blueprint-full-query';
import { YStack, XStack, Text, Card } from '@jarvis/ui-core';

interface AgentAlignmentSectionProps {
  agentAlignment: BlueprintAgentAlignment;
}

export function AgentAlignmentSection({ agentAlignment }: AgentAlignmentSectionProps) {
  return (
    <YStack marginBottom="$5">
      <Text fontSize="$3" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
        Agent Alignment
      </Text>
      <XStack
        flexWrap="wrap"
        gap="$4"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        <Card variant="outlined" padding="$3" flex={1} minWidth={220}>
          <Text fontSize="$2" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
            Facts Agent
          </Text>
          <YStack fontSize="$2" color="$gray9" gap="$2">
            <YStack>
              <Text fontWeight="600" marginBottom="$1" margin={0}>Highlights</Text>
              <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
                {(agentAlignment.facts?.highlights ?? []).length > 0 ? (
                  agentAlignment.facts?.highlights?.map((item, idx) => (
                    <li key={`facts-highlight-${idx}`} style={{ marginBottom: '4px' }}>
                      <Text margin={0}>{item}</Text>
                    </li>
                  ))
                ) : (
                  <li style={{ listStyle: 'none' }}>
                    <Text color="$gray5" margin={0}>No highlights captured</Text>
                  </li>
                )}
              </ul>
            </YStack>
            <YStack>
              <Text fontWeight="600" marginBottom="$1" margin={0}>Open Questions</Text>
              <ul style={{ margin: '4px 0', padding: '0 0 0 16px' }}>
                {(agentAlignment.facts?.open_questions ?? []).length > 0 ? (
                  agentAlignment.facts?.open_questions?.map((item, idx) => (
                    <li key={`facts-question-${idx}`} style={{ marginBottom: '4px' }}>
                      <Text margin={0}>{item}</Text>
                    </li>
                  ))
                ) : (
                  <li style={{ listStyle: 'none' }}>
                    <Text color="$gray5" margin={0}>No open questions</Text>
                  </li>
                )}
              </ul>
            </YStack>
          </YStack>
        </Card>
        <Card variant="outlined" padding="$3" flex={1} minWidth={220}>
          <Text fontSize="$2" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
            Cards Agent
          </Text>
          <YStack fontSize="$2" color="$gray9" gap="$2">
            <YStack>
              <Text fontWeight="600" marginBottom="$1" margin={0}>Assets</Text>
              <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
                {(agentAlignment.cards?.assets ?? []).length > 0 ? (
                  agentAlignment.cards?.assets?.map((item, idx) => (
                    <li key={`cards-asset-${idx}`} style={{ marginBottom: '4px' }}>
                      <Text margin={0}>{item}</Text>
                    </li>
                  ))
                ) : (
                  <li style={{ listStyle: 'none' }}>
                    <Text color="$gray5" margin={0}>No assets identified</Text>
                  </li>
                )}
              </ul>
            </YStack>
            <YStack>
              <Text fontWeight="600" marginBottom="$1" margin={0}>Open Questions</Text>
              <ul style={{ margin: '4px 0', padding: '0 0 0 16px' }}>
                {(agentAlignment.cards?.open_questions ?? []).length > 0 ? (
                  agentAlignment.cards?.open_questions?.map((item, idx) => (
                    <li key={`cards-question-${idx}`} style={{ marginBottom: '4px' }}>
                      <Text margin={0}>{item}</Text>
                    </li>
                  ))
                ) : (
                  <li style={{ listStyle: 'none' }}>
                    <Text color="$gray5" margin={0}>No open questions</Text>
                  </li>
                )}
              </ul>
            </YStack>
          </YStack>
        </Card>
      </XStack>
    </YStack>
  );
}

