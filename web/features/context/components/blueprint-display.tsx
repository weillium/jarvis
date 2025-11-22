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
import {
  YStack,
  XStack,
  Card,
  Alert,
  Badge,
  Heading,
  Body,
  BulletList,
  TagGroup,
  EmptyStateCard,
  LoadingState,
} from '@jarvis/ui-core';

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
      <LoadingState
        title="Loading blueprint"
        description="Fetching the latest context blueprint."
        padding="$6"
        align="start"
        skeletons={[{ height: 32 }, { height: 16 }, { height: 16 }]}
      />
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
      <EmptyStateCard
        title="No blueprint available"
        description="Generate context to populate the blueprint."
        padding="$6"
        titleLevel={5}
      />
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
          return acc;
        },
        { total: 0 }
      )
    : null;

  const detailSections = (
    <YStack gap="$5">
      {costBreakdown && <CostBreakdownSection costBreakdown={costBreakdown} />}

      {audienceProfile && <AudienceProfileSection audienceProfile={audienceProfile} />}

      {importantDetails && importantDetails.length > 0 && (
        <YStack gap="$3">
          <Heading level={4}>Important Details</Heading>
          <Card variant="outlined" padding="$4" gap="$3">
            <BulletList items={importantDetails} />
          </Card>
        </YStack>
      )}

      {inferredTopics && inferredTopics.length > 0 && (
        <YStack gap="$3">
          <Heading level={4}>Inferred Topics ({inferredTopics.length})</Heading>
          <Card variant="outlined" padding="$4" gap="$3">
            <TagGroup>
              {inferredTopics.map((topic, i) => (
                <Badge key={i} variant="blue" size="sm">
                  {topic}
                </Badge>
              ))}
            </TagGroup>
          </Card>
        </YStack>
      )}

      {keyTerms && keyTerms.length > 0 && (
        <YStack gap="$3">
          <Heading level={4}>Key Terms ({keyTerms.length})</Heading>
          <Card variant="outlined" padding="$4" gap="$3">
            <TagGroup>
              {keyTerms.map((term, i) => (
                <Badge key={i} variant="yellow" size="sm">
                  {term}
                </Badge>
              ))}
            </TagGroup>
          </Card>
        </YStack>
      )}

      {researchPlan && <ResearchPlanTable researchPlan={researchPlan} />}

      {glossaryPlan && <GlossaryPlanTable glossaryPlan={glossaryPlan} />}

      {chunksPlan && (
        <ChunksPlanTable
          chunksPlan={chunksPlan}
          chunkPlanStats={chunkPlanStats}
        />
      )}

      {agentAlignment && <AgentAlignmentSection agentAlignment={agentAlignment} />}
    </YStack>
  );

  if (embedded) {
    return (
      <YStack gap="$5">
        {expanded && detailSections}
      </YStack>
    );
  }

  return (
    <Card variant='outlined' backgroundColor="$gray1" padding="$5" gap="$5">
      <Heading level={4}>Context Blueprint</Heading>
      {expanded && detailSections}
    </Card>
  );
}
