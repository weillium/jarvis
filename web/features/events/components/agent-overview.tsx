'use client';

import React from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { useResetContextMutation } from '@/shared/hooks/use-mutations';
import { YStack, XStack, Text, Card, Alert } from '@jarvis/ui-core';

interface AgentOverviewProps {
  eventId: string;
}

type GenerationCycle = {
  cost: number | null;
  [key: string]: unknown;
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
};

export function AgentOverview({ eventId }: AgentOverviewProps) {
  const { data: agentData, isLoading, error } = useAgentQuery(eventId);
  const { data: cycles } = useContextVersionsQuery(eventId);
  const resetContextMutation = useResetContextMutation(eventId);
  
  const agent = agentData?.agent;
  const contextStats = agentData?.contextStats;
  const blueprint = agentData?.blueprint;
  
  const handleReset = () => {
    if (!confirm('Are you sure you want to invalidate all context components? This will require restarting context building.')) {
      return;
    }
    resetContextMutation.mutate();
  };
  
  const isResetting = resetContextMutation.isPending;
  const resetError = resetContextMutation.error ? (resetContextMutation.error instanceof Error ? resetContextMutation.error.message : 'Failed to reset context') : null;

  // Calculate total cost from cycles (from React Query)
  const totalCost = cycles?.reduce((sum: number, cycle: GenerationCycle) => {
    const cycleCost = cycle.cost;
    return sum + (cycleCost !== null && cycleCost !== undefined ? parseFloat(String(cycleCost)) : 0);
  }, 0) ?? null;

  const getStatusColor = (status: string | null, stage?: string | null, blueprintStatus?: string | null): string => {
    if (!status) return '#6b7280';
    
    if (status === 'error') return '#ef4444'; // red
    if (status === 'ended') return '#6b7280'; // gray
    if (status === 'paused') return '#f59e0b'; // amber
    if (status === 'active') {
      return stage === 'running' ? '#3b82f6' : stage === 'testing' ? '#8b5cf6' : '#3b82f6'; // blue/purple
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint':
          // Blueprint phase: use blueprint status for color
          if (blueprintStatus === 'generating') return '#3b82f6'; // blue - generating
          if (blueprintStatus === 'ready') return '#f59e0b'; // amber - awaiting approval
          if (blueprintStatus === 'approved') return '#10b981'; // green - approved
          if (blueprintStatus === 'error') return '#ef4444'; // red - error
          return '#8b5cf6'; // purple - default blueprint state
        case 'researching': return '#f59e0b'; // amber
        case 'building_glossary': return '#f59e0b'; // amber
        case 'building_chunks': return '#f59e0b'; // amber
        case 'regenerating_research': return '#f59e0b'; // amber
        case 'regenerating_glossary': return '#f59e0b'; // amber
        case 'regenerating_chunks': return '#f59e0b'; // amber
        case 'context_complete': return '#10b981'; // green
        case 'testing': return '#8b5cf6'; // purple
        case 'ready': return '#10b981'; // green
        case 'prepping': return '#f59e0b'; // amber
        default: return '#64748b'; // gray
      }
    }
    return '#6b7280';
  };

  const getStatusLabel = (status: string | null, stage?: string | null, blueprintStatus?: string | null): string => {
    if (!status) return 'Unknown';
    
    if (status === 'error') return 'Error';
    if (status === 'ended') return 'Ended';
    if (status === 'paused') return 'Paused';
    if (status === 'active') {
      return stage === 'running' ? 'Running' : stage === 'testing' ? 'Testing' : 'Active';
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint':
          // Enhanced blueprint phase labels based on blueprint status
          if (!blueprintStatus) return 'Waiting for Blueprint';
          if (blueprintStatus === 'generating') return 'Generating Blueprint';
          if (blueprintStatus === 'ready') return 'Blueprint Ready';
          if (blueprintStatus === 'approved') return 'Blueprint Approved';
          if (blueprintStatus === 'error') return 'Blueprint Error';
          return 'Blueprint';
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

  if (isLoading) {
    return (
      <YStack padding="$8" alignItems="center">
        <YStack
          width={40}
          height={40}
          borderWidth={3}
          borderColor="$borderColor"
          borderTopColor="$blue6"
          borderRadius="$10"
          animation="spin"
        />
        <Text marginTop="$4" color="$gray11" fontSize="$3">
          Loading agent information...
        </Text>
      </YStack>
    );
  }

  if (error || !agent) {
    return (
      <YStack padding="$8" alignItems="center">
        <Alert variant="error">
          {error instanceof Error ? error.message : (error ? String(error) : 'No agent found for this event')}
        </Alert>
      </YStack>
    );
  }

  const statusColor = getStatusColor(agent.status, agent.stage, blueprint?.status);
  const statusLabel = getStatusLabel(agent.status, agent.stage, blueprint?.status);

  return (
    <YStack>
      {/* Agent Details Grid */}
      <XStack
        flexWrap="wrap"
        gap="$5"
        marginBottom="$6"
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
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$color"
            fontFamily="$mono"
            wordBreak="break-all"
          >
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
        <YStack minWidth={180} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$1.5"
          >
            Total Cost
          </Text>
          <XStack alignItems="center" gap="$1">
            {totalCost !== null ? (
              <Text fontSize="$3" fontWeight="600" color="$green11">
                ${totalCost.toFixed(4)}
              </Text>
            ) : (
              <Text fontSize="$2" color="$gray5">
                N/A
              </Text>
            )}
          </XStack>
        </YStack>
      </XStack>

      {/* Context Statistics */}
      {contextStats && (
        <YStack
          marginBottom="$6"
          paddingBottom="$6"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
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
              </YStack>
            </Card>
          </XStack>
        </YStack>
      )}

      {/* Context Generation Progress */}
      <YStack marginBottom="$6">
        {resetError && (
          <Alert variant="error" marginBottom="$4">
            {resetError}
          </Alert>
        )}
        <ContextGenerationPanel 
          eventId={eventId} 
          embedded={true}
          onClearContext={agent && agent.status !== 'idle' ? handleReset : undefined}
          isClearing={isResetting}
        />
      </YStack>
    </YStack>
  );
}

