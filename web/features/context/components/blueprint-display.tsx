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
  Card,
  Alert,
  Badge,
  Heading,
  Body,
  StatGroup,
  StatItem,
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

  const summaryStats = (
    <StatGroup>
      {targetChunkCount !== null && (
        <StatItem label="Target Chunks (Plan)" value={targetChunkCount.toLocaleString()} flex={1} />
      )}
      {chunkPlanStats && (
        <StatItem
          label="Estimated Chunks (Plan)"
          value={chunkPlanStats.total.toLocaleString()}
          helperText={
            chunkPlanCoverage !== null ? `${chunkPlanCoverage}% of target` : undefined
          }
          flex={1}
        />
      )}
      {qualityTier && (
        <StatItem
          label="Quality Tier"
          value={qualityTier.charAt(0).toUpperCase() + qualityTier.slice(1)}
          flex={1}
        />
      )}
      {blueprint.estimated_cost !== null && (
        <StatItem
          label="Estimated Cost"
          value={`$${blueprint.estimated_cost.toFixed(4)}`}
          flex={1}
        />
      )}
    </StatGroup>
  );

  const detailSections = (
    <YStack gap="$5">
      {audienceProfile && <AudienceProfileSection audienceProfile={audienceProfile} />}

      {importantDetails && importantDetails.length > 0 && (
        <YStack gap="$3">
          <Heading level={4}>Important Details</Heading>
          <BulletList items={importantDetails} />
        </YStack>
      )}

      {inferredTopics && inferredTopics.length > 0 && (
        <YStack gap="$3">
          <Heading level={4}>Inferred Topics</Heading>
          <TagGroup>
            {inferredTopics.map((topic, i) => (
              <Badge key={i} variant="blue" size="md">
                {topic}
              </Badge>
            ))}
          </TagGroup>
        </YStack>
      )}

      {keyTerms && keyTerms.length > 0 && (
        <YStack gap="$3">
          <Heading level={4}>Key Terms</Heading>
          <TagGroup>
            {keyTerms.map((term, i) => (
              <Badge key={i} variant="yellow" size="md">
                {term}
              </Badge>
            ))}
          </TagGroup>
        </YStack>
      )}

      {researchPlan && <ResearchPlanTable researchPlan={researchPlan} />}

      {glossaryPlan && <GlossaryPlanTable glossaryPlan={glossaryPlan} />}

      {chunksPlan && (
        <ChunksPlanTable
          chunksPlan={chunksPlan}
          chunkPlanStats={chunkPlanStats}
          chunkPlanCoverage={chunkPlanCoverage}
        />
      )}

      {agentAlignment && <AgentAlignmentSection agentAlignment={agentAlignment} />}

      <CostBreakdownSection costBreakdown={costBreakdown} />
    </YStack>
  );

  if (embedded) {
    return (
      <YStack gap="$5">
        {summaryStats}
        {expanded && detailSections}
      </YStack>
    );
  }

  return (
    <Card variant='outlined' backgroundColor="$gray1" padding="$5" gap="$5">
      <Heading level={4}>Context Blueprint</Heading>
      {summaryStats}
      {expanded && detailSections}
    </Card>
  );
}
