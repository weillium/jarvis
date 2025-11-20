'use client';

import { useState } from 'react';
import { useAgentInfo, AgentInfo as AgentInfoType } from '@/shared/hooks/useAgentInfo';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { ContextDatabaseVisualization } from '@/features/events/components/context-database-visualization';
import { GlossaryVisualization } from '@/features/context/components/glossary-visualization';
import { ResearchResultsVisualization } from '@/features/context/components/research-results-visualization';
import { VersionHistory } from '@/features/context/components/version-history';
import {
  YStack,
  XStack,
  Card,
  Button,
  Alert,
  Heading,
  Body,
  Label,
  Caption,
  StatGroup,
  StatItem,
  Badge,
  Text,
  EmptyStateCard,
  Skeleton,
} from '@jarvis/ui-core';

interface AgentInfoProps {
  eventId: string;
}

export function AgentInfo({ eventId }: AgentInfoProps) {
  const { agent, contextStats, blueprint, loading, error } = useAgentInfo(eventId);
  const [isDatabaseExpanded, setIsDatabaseExpanded] = useState(false);
  const [isGlossaryExpanded, setIsGlossaryExpanded] = useState(false);
  const [isResearchExpanded, setIsResearchExpanded] = useState(false);

  const getStatusColor = (status: AgentInfoType['status'] | null, stage?: string | null): string => {
    if (!status) return '$gray11';
    
    if (status === 'error') return '$red11';
    if (status === 'ended') return '$gray11';
    if (status === 'paused') return '$yellow11';
    if (status === 'active') {
      return stage === 'running' ? '$blue11' : stage === 'testing' ? '$purple11' : '$blue11';
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint': return '$purple11';
        case 'researching': return '$yellow11';
        case 'building_glossary': return '$yellow11';
        case 'building_chunks': return '$yellow11';
        case 'regenerating_research': return '$yellow11';
        case 'regenerating_glossary': return '$yellow11';
        case 'regenerating_chunks': return '$yellow11';
        case 'context_complete': return '$green11';
        case 'testing': return '$purple11';
        case 'ready': return '$green11';
        case 'prepping': return '$yellow11';
        default: return '$gray11';
      }
    }
    return '$gray11';
  };

  const getStatusLabel = (status: AgentInfoType['status'] | null, stage?: string | null): string => {
    if (!status) return 'Unknown';
    
    if (status === 'error') return 'Error';
    if (status === 'ended') return 'Ended';
    if (status === 'paused') return 'Paused';
    if (status === 'active') {
      return stage === 'running' ? 'Running' : stage === 'testing' ? 'Testing' : 'Active';
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint': return 'Blueprint';
        case 'researching': return 'Researching';
        case 'building_glossary': return 'Building Glossary';
        case 'building_chunks': return 'Building Chunks';
        case 'regenerating_research': return 'Regenerating Research';
        case 'regenerating_glossary': return 'Regenerating Glossary';
        case 'regenerating_chunks': return 'Regenerating Chunks';
        case 'context_complete': return 'Context Complete';
        case 'testing': return 'Testing';
        case 'ready': return 'Ready';
        case 'prepping': return 'Prepping';
        default: return 'Idle';
      }
    }
    return 'Unknown';
  };

  // Loading state
  if (loading) {
    return (
      <Card variant="outlined" padding="$8" marginBottom="$6">
        <XStack alignItems="center" gap="$4">
          <Skeleton width={56} height={56} shape="circle" />
          <YStack flex={1} gap="$2">
            <Skeleton height={20} width={200} />
            <Skeleton height={16} width={150} />
          </YStack>
        </XStack>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card variant="outlined" padding="$8" marginBottom="$6" borderColor="$red3">
        <XStack alignItems="center" gap="$4">
          <YStack
            width={56}
            height={56}
            borderRadius="$10"
            backgroundColor="$red2"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={28}>⚠️</Text>
          </YStack>
          <YStack>
            <Heading level={4}>Agent Information</Heading>
            <Body tone="danger">{error}</Body>
          </YStack>
        </XStack>
      </Card>
    );
  }

  // No agent state
  if (!agent) {
    return (
      <EmptyStateCard
        title="Agent information unavailable"
        description="Attach or configure an agent for this event to view status and context."
        icon={
          <Text fontSize="$6" margin={0}>
            🤖
          </Text>
        }
        padding="$6"
        marginBottom="$6"
        align="start"
        titleLevel={4}
      />
    );
  }

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (!agent) {
    return null;
  }

  const statusColor = getStatusColor(agent.status, agent.stage);
  const statusLabel = getStatusLabel(agent.status, agent.stage);

  return (
    <Card variant="outlined" padding="$8" marginBottom="$6">
      {/* Header */}
      <XStack alignItems="center" gap="$4" marginBottom="$6">
        <YStack
          width={56}
          height={56}
          borderRadius="$10"
          backgroundColor="$gray2"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={28}>🤖</Text>
        </YStack>
        <YStack flex={1}>
          <Heading level={4}>Agent Information</Heading>
          <XStack alignItems="center" gap="$3" flexWrap="wrap">
            <YStack
              padding="$1.5 $3.5"
              borderRadius="$5"
              backgroundColor="$gray2"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Body size="sm" weight="medium" color={statusColor}>
                {statusLabel}
              </Body>
            </YStack>
            <Body tone="muted">
              Model Set: {agent.model_set}
            </Body>
          </XStack>
        </YStack>
      </XStack>

      {/* Agent Details Grid */}
      <StatGroup>
        <StatItem label="Agent ID" value={`${agent.id.substring(0, 8)}…`} />
        <StatItem label="Status" value={statusLabel} helperText={agent.stage ?? undefined} />
        <StatItem label="Model Set" value={agent.model_set} />
        <StatItem label="Created" value={formatDate(agent.created_at)} />
      </StatGroup>

      {/* Context Statistics */}
      {contextStats && (
        <YStack
          paddingTop="$6"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          marginBottom="$6"
        >
          <Heading level={3}>Context Library</Heading>
          <XStack
            flexWrap="wrap"
            gap="$4"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            <Card variant="outlined" backgroundColor="$gray1" padding="$4" flex={1} minWidth={150}>
              <YStack gap="$1">
                <Heading level={2} color="$blue6">
                  {contextStats.chunkCount.toLocaleString()}
                </Heading>
                <Label size="xs">Context Chunks</Label>
                {blueprint?.target_chunk_count && (
                  <Caption marginTop="$1">
                    Target: {blueprint.target_chunk_count.toLocaleString()}
                  </Caption>
                )}
              </YStack>
            </Card>
            <Card variant="outlined" backgroundColor="$gray1" padding="$4" flex={1} minWidth={150}>
              <YStack gap="$1">
                <Heading level={2} color="$green11">
                  {contextStats.glossaryTermCount.toLocaleString()}
                </Heading>
                <Label size="xs">Glossary Terms</Label>
              </YStack>
            </Card>
          </XStack>
        </YStack>
      )}

      {/* Blueprint Information */}
      {blueprint && (
        <YStack
          paddingTop="$6"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          marginBottom="$6"
        >
          <Heading level={3}>Context Blueprint</Heading>
          <XStack
            flexWrap="wrap"
            gap="$4"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            {blueprint.target_chunk_count && (
              <YStack minWidth={150} flex={1}>
                <Label size="xs">Target Chunks</Label>
                <Body size="lg" weight="medium">
                  {blueprint.target_chunk_count.toLocaleString()}
                </Body>
              </YStack>
            )}
            {blueprint.quality_tier && (
              <YStack minWidth={150} flex={1}>
                <Label size="xs">Quality Tier</Label>
                <Body size="lg" weight="medium">
                  {blueprint.quality_tier}
                </Body>
              </YStack>
            )}
            {blueprint.estimated_cost !== null && (
              <YStack minWidth={150} flex={1}>
                <Label size="xs">Estimated Cost</Label>
                <Body size="lg" weight="medium">
                  ${blueprint.estimated_cost.toFixed(2)}
                </Body>
              </YStack>
            )}
            {blueprint.status && (
              <YStack minWidth={150} flex={1}>
                <Label size="xs">Blueprint Status</Label>
                <Body
                  size="lg"
                  weight="medium"
                  color={blueprint.status === 'approved' || blueprint.status === 'completed' ? '$green11' : '$gray11'}
                >
                  {blueprint.status}
                </Body>
              </YStack>
            )}
          </XStack>
        </YStack>
      )}

      {/* Context Database Section - Collapsible */}
      {contextStats && contextStats.chunkCount > 0 && (
        <YStack
          paddingTop="$6"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          marginBottom="$6"
        >
          <Button
            variant="ghost"
            width="100%"
            justifyContent="space-between"
            padding="$3 0"
            onClick={() => setIsDatabaseExpanded(!isDatabaseExpanded)}
          >
            <Body size="sm" weight="medium">
              Context Database ({contextStats.chunkCount.toLocaleString()} chunks)
            </Body>
            <Body size="lg">{isDatabaseExpanded ? '▼' : '▶'}</Body>
          </Button>
          {isDatabaseExpanded && (
            <YStack marginTop="$4">
              <ContextDatabaseVisualization eventId={eventId} agentStatus={agent.status} agentStage={agent.stage} embedded={true} />
            </YStack>
          )}
        </YStack>
      )}

      {/* Glossary Section - Collapsible, only show when context is complete */}
      {agent.status === 'idle' && agent.stage === 'context_complete' && contextStats && contextStats.glossaryTermCount > 0 && (
        <YStack
          paddingTop="$6"
          borderTopWidth={1}
          borderTopColor="$borderColor"
        >
          <Button
            variant="ghost"
            width="100%"
            justifyContent="space-between"
            padding="$3 0"
            onClick={() => setIsGlossaryExpanded(!isGlossaryExpanded)}
          >
            <Body size="sm" weight="medium">
              Glossary ({contextStats.glossaryTermCount.toLocaleString()} terms)
            </Body>
            <Body size="lg">{isGlossaryExpanded ? '▼' : '▶'}</Body>
          </Button>
          {isGlossaryExpanded && (
            <YStack marginTop="$4">
              <GlossaryVisualization eventId={eventId} embedded={true} />
            </YStack>
          )}
        </YStack>
      )}

      {/* Research Results Section - Collapsible */}
      <YStack
        paddingTop="$6"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        marginBottom="$6"
      >
        <Button
          variant="ghost"
          width="100%"
          justifyContent="space-between"
          padding="$3 0"
          onClick={() => setIsResearchExpanded(!isResearchExpanded)}
        >
          <Body size="sm" weight="medium">
            Research Results
          </Body>
          <Body size="lg">{isResearchExpanded ? '▼' : '▶'}</Body>
        </Button>
        {isResearchExpanded && (
          <YStack marginTop="$4">
            <ResearchResultsVisualization eventId={eventId} embedded={true} />
          </YStack>
        )}
      </YStack>

      {/* Version History Section */}
      <YStack
        paddingTop="$6"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        marginBottom="$6"
      >
        <VersionHistory eventId={eventId} embedded={true} />
      </YStack>
    </Card>
  );
}
