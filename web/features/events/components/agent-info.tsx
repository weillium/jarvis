'use client';

import { useState } from 'react';
import { useAgentInfo, AgentInfo as AgentInfoType } from '@/shared/hooks/useAgentInfo';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { ContextDatabaseVisualization } from '@/features/events/components/context-database-visualization';
import { GlossaryVisualization } from '@/features/context/components/glossary-visualization';
import { ResearchResultsVisualization } from '@/features/context/components/research-results-visualization';
import { VersionHistory } from '@/features/context/components/version-history';
import { YStack, XStack, Text, Card, Button, Alert } from '@jarvis/ui-core';

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
          <YStack
            width={56}
            height={56}
            borderRadius="$10"
            backgroundColor="$gray2"
            alignItems="center"
            justifyContent="center"
            fontSize={28}
          >
            🤖
          </YStack>
          <YStack flex={1} gap="$2">
            <YStack
              height={20}
              backgroundColor="$gray3"
              borderRadius="$1"
              width={200}
            />
            <YStack
              height={16}
              backgroundColor="$gray3"
              borderRadius="$1"
              width={150}
            />
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
            fontSize={28}
          >
            ⚠️
          </YStack>
          <YStack>
            <Text fontSize="$5" fontWeight="600" color="$color" marginBottom="$1" margin={0}>
              Agent Information
            </Text>
            <Text fontSize="$3" color="$red11" margin={0}>
              {error}
            </Text>
          </YStack>
        </XStack>
      </Card>
    );
  }

  // No agent state
  if (!agent) {
    return (
      <Card variant="outlined" padding="$8" marginBottom="$6">
        <XStack alignItems="center" gap="$4">
          <YStack
            width={56}
            height={56}
            borderRadius="$10"
            backgroundColor="$gray2"
            alignItems="center"
            justifyContent="center"
            fontSize={28}
          >
            🤖
          </YStack>
          <YStack>
            <Text fontSize="$5" fontWeight="600" color="$color" marginBottom="$1" margin={0}>
              Agent Information
            </Text>
            <Text fontSize="$3" color="$gray11" margin={0}>
              No agent associated with this event
            </Text>
          </YStack>
        </XStack>
      </Card>
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
          fontSize={28}
        >
          🤖
        </YStack>
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
            Agent Information
          </Text>
          <XStack alignItems="center" gap="$3" flexWrap="wrap">
            <YStack
              padding="$1.5 $3.5"
              borderRadius="$5"
              backgroundColor="$gray2"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Text fontSize="$3" fontWeight="600" color={statusColor}>
                {statusLabel}
              </Text>
            </YStack>
            <Text fontSize="$3" color="$gray11">
              Model Set: {agent.model_set}
            </Text>
          </XStack>
        </YStack>
      </XStack>

      {/* Agent Details Grid */}
      <XStack
        flexWrap="wrap"
        gap="$5"
        paddingTop="$5"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        marginBottom={(contextStats || blueprint) ? '$6' : 0}
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        <YStack minWidth={180} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$1.5"
          >
            Agent ID
          </Text>
          <Text fontSize="$3" fontWeight="500" color="$color" fontFamily="$mono" style={{ wordBreak: 'break-all' }}>
            {agent.id.substring(0, 8)}...
          </Text>
        </YStack>
        <YStack minWidth={180} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$1.5"
          >
            Status
          </Text>
          <Text fontSize="$3" fontWeight="500" color={statusColor}>
            {statusLabel}
          </Text>
        </YStack>
        <YStack minWidth={180} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$1.5"
          >
            Model Set
          </Text>
          <Text fontSize="$3" fontWeight="500" color="$color">
            {agent.model_set}
          </Text>
        </YStack>
        <YStack minWidth={180} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$1.5"
          >
            Created
          </Text>
          <Text fontSize="$3" fontWeight="500" color="$color">
            {formatDate(agent.created_at)}
          </Text>
        </YStack>
      </XStack>

      {/* Context Statistics */}
      {contextStats && (
        <YStack
          paddingTop="$6"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          marginBottom="$6"
        >
          <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$4" margin={0}>
            Context Library
          </Text>
          <XStack
            flexWrap="wrap"
            gap="$4"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            <Card variant="outlined" backgroundColor="$gray1" padding="$4" flex={1} minWidth={150}>
              <YStack gap="$1">
                <Text fontSize="$7" fontWeight="700" color="$blue6" marginBottom="$1">
                  {contextStats.chunkCount.toLocaleString()}
                </Text>
                <Text
                  fontSize="$2"
                  fontWeight="500"
                  color="$gray11"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Context Chunks
                </Text>
                {blueprint?.target_chunk_count && (
                  <Text fontSize="$1" color="$gray5" marginTop="$1">
                    Target: {blueprint.target_chunk_count.toLocaleString()}
                  </Text>
                )}
              </YStack>
            </Card>
            <Card variant="outlined" backgroundColor="$gray1" padding="$4" flex={1} minWidth={150}>
              <YStack gap="$1">
                <Text fontSize="$7" fontWeight="700" color="$green11" marginBottom="$1">
                  {contextStats.glossaryTermCount.toLocaleString()}
                </Text>
                <Text
                  fontSize="$2"
                  fontWeight="500"
                  color="$gray11"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                >
                  Glossary Terms
                </Text>
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
          <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$4" margin={0}>
            Context Blueprint
          </Text>
          <XStack
            flexWrap="wrap"
            gap="$4"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            {blueprint.target_chunk_count && (
              <YStack minWidth={150} flex={1}>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$gray11"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  marginBottom="$1.5"
                >
                  Target Chunks
                </Text>
                <Text fontSize="$3" fontWeight="500" color="$color">
                  {blueprint.target_chunk_count.toLocaleString()}
                </Text>
              </YStack>
            )}
            {blueprint.quality_tier && (
              <YStack minWidth={150} flex={1}>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$gray11"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  marginBottom="$1.5"
                >
                  Quality Tier
                </Text>
                <Text fontSize="$3" fontWeight="500" color="$color">
                  {blueprint.quality_tier}
                </Text>
              </YStack>
            )}
            {blueprint.estimated_cost !== null && (
              <YStack minWidth={150} flex={1}>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$gray11"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  marginBottom="$1.5"
                >
                  Estimated Cost
                </Text>
                <Text fontSize="$3" fontWeight="500" color="$color">
                  ${blueprint.estimated_cost.toFixed(2)}
                </Text>
              </YStack>
            )}
            {blueprint.status && (
              <YStack minWidth={150} flex={1}>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$gray11"
                  textTransform="uppercase"
                  letterSpacing={0.5}
                  marginBottom="$1.5"
                >
                  Blueprint Status
                </Text>
                <Text
                  fontSize="$3"
                  fontWeight="500"
                  color={blueprint.status === 'approved' || blueprint.status === 'completed' ? '$green11' : '$gray11'}
                >
                  {blueprint.status}
                </Text>
              </YStack>
            )}
          </XStack>
        </YStack>
      )}

      {/* Context Generation Section */}
      <YStack
        paddingTop="$6"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        marginBottom="$6"
      >
        <ContextGenerationPanel eventId={eventId} embedded={true} />
      </YStack>

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
            onPress={() => setIsDatabaseExpanded(!isDatabaseExpanded)}
          >
            <Text fontSize="$4" fontWeight="600" color="$color">
              Context Database ({contextStats.chunkCount.toLocaleString()} chunks)
            </Text>
            <Text
              fontSize="$5"
              style={{
                transform: isDatabaseExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              ▼
            </Text>
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
            onPress={() => setIsGlossaryExpanded(!isGlossaryExpanded)}
          >
            <Text fontSize="$4" fontWeight="600" color="$color">
              Glossary ({contextStats.glossaryTermCount.toLocaleString()} terms)
            </Text>
            <Text
              fontSize="$5"
              style={{
                transform: isGlossaryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              ▼
            </Text>
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
          onPress={() => setIsResearchExpanded(!isResearchExpanded)}
        >
          <Text fontSize="$4" fontWeight="600" color="$color">
            Research Results
          </Text>
          <Text
            fontSize="$5"
            style={{
              transform: isResearchExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            ▼
          </Text>
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
