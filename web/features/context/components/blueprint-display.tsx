'use client';

import { useState } from 'react';
import { useBlueprintFullQuery } from '@/shared/hooks/use-blueprint-full-query';
import {
  isRecord,
  isStringArray,
  asResearchPlan,
  asGlossaryPlan,
  asChunksPlan,
  asAgentAlignment,
  asAudienceProfile,
  type BlueprintAudienceProfile,
} from './blueprint-display-utils';
import { ResearchPlanTable } from './research-plan-table';
import { GlossaryPlanTable } from './glossary-plan-table';
import { ChunksPlanTable } from './chunks-plan-table';
import { AudienceProfileSection } from './audience-profile-section';
import { AgentAlignmentSection } from './agent-alignment-section';
import { CostBreakdownSection } from './cost-breakdown-section';
import { YStack, XStack, Text, Card, Alert, Badge } from '@jarvis/ui-core';

interface BlueprintDisplayProps {
  eventId: string;
  onRegenerate?: () => void;
  embedded?: boolean; // If true, removes expand button and regenerate button
}

export function BlueprintDisplay({
  eventId,
  onRegenerate,
  embedded = false,
}: BlueprintDisplayProps) {
  const { data: blueprint, isLoading, error } = useBlueprintFullQuery(eventId);
  const [expanded, setExpanded] = useState(embedded); // Auto-expand when embedded

  // Handle regenerate blueprint - just trigger the parent's callback to show prompt preview modal
  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
    }
  };

  if (isLoading) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray11">Loading blueprint...</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        Error loading blueprint: {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  if (!blueprint) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray11">No blueprint available</Text>
      </YStack>
    );
  }

  const blueprintJson = isRecord(blueprint.blueprint) ? blueprint.blueprint : null;

  const importantDetails =
    (isStringArray(blueprint.important_details) && blueprint.important_details.length > 0
      ? blueprint.important_details
      : undefined) ??
    (blueprintJson && isStringArray(blueprintJson['important_details'])
      ? blueprintJson['important_details']
      : undefined);

  const inferredTopics =
    (isStringArray(blueprint.inferred_topics) && blueprint.inferred_topics.length > 0
      ? blueprint.inferred_topics
      : undefined) ??
    (blueprintJson && isStringArray(blueprintJson['inferred_topics'])
      ? blueprintJson['inferred_topics']
      : undefined);

  const keyTerms =
    (isStringArray(blueprint.key_terms) && blueprint.key_terms.length > 0
      ? blueprint.key_terms
      : undefined) ??
    (blueprintJson && isStringArray(blueprintJson['key_terms'])
      ? blueprintJson['key_terms']
      : undefined);

  const researchPlan = asResearchPlan(
    blueprint.research_plan,
    blueprintJson ? blueprintJson['research_plan'] : undefined
  );

  const glossaryPlan = asGlossaryPlan(
    blueprint.glossary_plan,
    blueprintJson ? blueprintJson['glossary_plan'] : undefined
  );

  const chunksPlan = asChunksPlan(
    blueprint.chunks_plan,
    blueprintJson ? blueprintJson['chunks_plan'] : undefined
  );

  const agentAlignment = asAgentAlignment(
    blueprint.agent_alignment,
    blueprintJson ? blueprintJson['agent_alignment'] : undefined
  );

  const audienceProfile = asAudienceProfile(
    blueprintJson ? blueprintJson['audience_profile'] : undefined
  );

  const costBreakdown = isRecord(blueprint.cost_breakdown)
    ? (blueprint.cost_breakdown as Record<string, unknown>)
    : isRecord(blueprintJson?.['cost_breakdown'])
      ? (blueprintJson?.['cost_breakdown'] as Record<string, unknown>)
      : null;

  const chunkPlanStats = chunksPlan
    ? chunksPlan.sources.reduce(
        (acc, source) => {
          acc.total += source.estimated_chunks;
          if (source.agent_utility.includes('facts')) {
            acc.facts += source.estimated_chunks;
          }
          if (source.agent_utility.includes('cards')) {
            acc.cards += source.estimated_chunks;
          }
          return acc;
        },
        { total: 0, facts: 0, cards: 0 }
      )
    : null;

  const chunkPlanCoverage =
    chunksPlan && chunkPlanStats && chunksPlan.target_count > 0
      ? Math.round((chunkPlanStats.total / chunksPlan.target_count) * 100)
      : null;

  const targetChunkCount = blueprint.target_chunk_count ?? chunksPlan?.target_count ?? null;
  const qualityTier = blueprint.quality_tier ?? chunksPlan?.quality_tier ?? null;

  if (embedded) {
    return (
      <YStack>

      {/* Summary */}
      <XStack
        flexWrap="wrap"
        gap="$4"
        marginBottom="$4"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        {targetChunkCount !== null && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Target Chunks (Plan)
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              {targetChunkCount.toLocaleString()}
            </Text>
          </YStack>
        )}
        {chunkPlanStats && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Estimated Chunks (Plan)
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              {chunkPlanStats.total.toLocaleString()}
            </Text>
            {chunkPlanCoverage !== null && (
              <Text fontSize="$1" color="$gray5" marginTop="$0.5" margin={0}>
                {chunkPlanCoverage}% of target
              </Text>
            )}
          </YStack>
        )}
        {qualityTier && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Quality Tier
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" textTransform="capitalize" margin={0}>
              {qualityTier}
            </Text>
          </YStack>
        )}
        {blueprint.estimated_cost !== null && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Estimated Cost
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              ${blueprint.estimated_cost.toFixed(4)}
            </Text>
          </YStack>
        )}
      </XStack>

      {/* Expandable details */}
      {expanded && (
        <YStack marginTop="$5" gap="$5">
          {/* Audience Profile */}
          {audienceProfile && (
            <AudienceProfileSection audienceProfile={audienceProfile} />
          )}

          {/* Important Details */}
          {importantDetails && importantDetails.length > 0 && (
            <YStack marginBottom="$5">
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Important Details
              </Text>
              <YStack margin={0} paddingLeft="$5" gap="$1">
                {importantDetails.map((detail, i) => (
                  <XStack key={i} margin={0} gap="$2">
                    <Text fontSize="$3" color="$gray9" margin={0} lineHeight={1.6}>
                      •
                    </Text>
                    <Text fontSize="$3" color="$gray9" margin={0} lineHeight={1.6} flex={1}>
                      {detail}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          )}

          {/* Inferred Topics */}
          {inferredTopics && inferredTopics.length > 0 && (
            <YStack marginBottom="$5">
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Inferred Topics
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {inferredTopics.map((topic, i) => (
                  <Badge key={i} variant="blue" size="md">
                    {topic}
                  </Badge>
                ))}
              </XStack>
            </YStack>
          )}

          {/* Key Terms */}
          {keyTerms && keyTerms.length > 0 && (
            <YStack marginBottom="$5">
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Key Terms
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {keyTerms.map((term, i) => (
                  <Badge key={i} variant="yellow" size="md">
                    {term}
                  </Badge>
                ))}
              </XStack>
            </YStack>
          )}

          {/* Research Plan */}
          {researchPlan && (
            <ResearchPlanTable researchPlan={researchPlan} />
          )}

          {/* Glossary Plan */}
          {glossaryPlan && (
            <GlossaryPlanTable glossaryPlan={glossaryPlan} />
          )}

          {/* Chunks Plan */}
          {chunksPlan && (
            <ChunksPlanTable
              chunksPlan={chunksPlan}
              chunkPlanStats={chunkPlanStats}
              chunkPlanCoverage={chunkPlanCoverage}
            />
          )}

          {/* Agent Alignment */}
          {agentAlignment && (
            <AgentAlignmentSection agentAlignment={agentAlignment} />
          )}

          {/* Cost Breakdown */}
          <CostBreakdownSection costBreakdown={costBreakdown} />
        </YStack>
      )}
      </YStack>
    );
  }

  return (
    <Card variant="outlined" backgroundColor="$gray1" padding="$5">
      {/* Header - only show title when not embedded */}
      <XStack justifyContent="space-between" alignItems="center" marginBottom="$4">
        <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
          Context Blueprint
        </Text>
      </XStack>

      {/* Summary */}
      <XStack
        flexWrap="wrap"
        gap="$4"
        marginBottom="$4"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        {targetChunkCount !== null && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Target Chunks (Plan)
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              {targetChunkCount.toLocaleString()}
            </Text>
          </YStack>
        )}
        {chunkPlanStats && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Estimated Chunks (Plan)
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              {chunkPlanStats.total.toLocaleString()}
            </Text>
            {chunkPlanCoverage !== null && (
              <Text fontSize="$1" color="$gray5" marginTop="$0.5" margin={0}>
                {chunkPlanCoverage}% of target
              </Text>
            )}
          </YStack>
        )}
        {qualityTier && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Quality Tier
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" textTransform="capitalize" margin={0}>
              {qualityTier}
            </Text>
          </YStack>
        )}
        {blueprint.estimated_cost !== null && (
          <YStack flex={1} minWidth={200}>
            <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
              Estimated Cost
            </Text>
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              ${blueprint.estimated_cost.toFixed(4)}
            </Text>
          </YStack>
        )}
      </XStack>

      {/* Expandable details */}
      {expanded && (
        <YStack marginTop="$5" gap="$5">
          {/* Audience Profile */}
          {audienceProfile && (
            <AudienceProfileSection audienceProfile={audienceProfile} />
          )}

          {/* Important Details */}
          {importantDetails && importantDetails.length > 0 && (
            <YStack marginBottom="$5">
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Important Details
              </Text>
              <YStack margin={0} paddingLeft="$5" gap="$1">
                {importantDetails.map((detail, i) => (
                  <XStack key={i} margin={0} gap="$2">
                    <Text fontSize="$3" color="$gray9" margin={0} lineHeight={1.6}>
                      •
                    </Text>
                    <Text fontSize="$3" color="$gray9" margin={0} lineHeight={1.6} flex={1}>
                      {detail}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          )}

          {/* Inferred Topics */}
          {inferredTopics && inferredTopics.length > 0 && (
            <YStack marginBottom="$5">
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Inferred Topics
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {inferredTopics.map((topic, i) => (
                  <Badge key={i} variant="blue" size="md">
                    {topic}
                  </Badge>
                ))}
              </XStack>
            </YStack>
          )}

          {/* Key Terms */}
          {keyTerms && keyTerms.length > 0 && (
            <YStack marginBottom="$5">
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Key Terms
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {keyTerms.map((term, i) => (
                  <Badge key={i} variant="yellow" size="md">
                    {term}
                  </Badge>
                ))}
              </XStack>
            </YStack>
          )}

          {/* Research Plan */}
          {researchPlan && (
            <ResearchPlanTable researchPlan={researchPlan} />
          )}

          {/* Glossary Plan */}
          {glossaryPlan && (
            <GlossaryPlanTable glossaryPlan={glossaryPlan} />
          )}

          {/* Chunks Plan */}
          {chunksPlan && (
            <ChunksPlanTable
              chunksPlan={chunksPlan}
              chunkPlanStats={chunkPlanStats}
              chunkPlanCoverage={chunkPlanCoverage}
            />
          )}

          {/* Agent Alignment */}
          {agentAlignment && (
            <AgentAlignmentSection agentAlignment={agentAlignment} />
          )}

          {/* Cost Breakdown */}
          <CostBreakdownSection costBreakdown={costBreakdown} />
        </YStack>
      )}
    </Card>
  );
}

