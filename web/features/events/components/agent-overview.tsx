'use client';

import React from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { useResetContextMutation } from '@/shared/hooks/use-mutations';
import {
  YStack,
  XStack,
  Card,
  Alert,
  Body,
  Label,
  Heading,
  Badge,
  StatGroup,
  StatItem,
  Button,
  Text,
  EmptyStateCard,
  LoadingState,
  Skeleton,
} from '@jarvis/ui-core';

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
      <LoadingState
        title="Loading agent information"
        description="Fetching the latest agent status and context metrics."
        align="start"
        padding="$6"
        skeletons={[
          { height: 24, width: 200 },
          { height: 24, width: 150 },
          { height: 80, width: '100%' },
        ]}
      />
    );
  }

  if (error || !agent) {
    const message =
      error instanceof Error ? error.message : error ? String(error) : 'No agent found for this event';
    return (
      <EmptyStateCard
        title="Agent details unavailable"
        description={message}
        icon={
          <Text fontSize="$6" margin={0}>
            🤖
          </Text>
        }
        padding="$6"
        borderWidth={1}
        borderColor="$borderColor"
        backgroundColor="$background"
        titleLevel={4}
        align="start"
      />
    );
  }

  const statusColor = getStatusColor(agent.status, agent.stage, blueprint?.status);
  const statusLabel = getStatusLabel(agent.status, agent.stage, blueprint?.status);

  return (
    <YStack gap="$6">
      {/* Agent Details Grid */}
      <StatGroup>
        <StatItem
          label="Agent ID"
          value={`${agent.id.substring(0, 8)}…`}
          helperText="Auto generated"
        />
        <StatItem label="Status" value={statusLabel} helperText={agent.stage ?? undefined} />
        <StatItem label="Model Set" value={agent.model_set} />
        <StatItem label="Created" value={formatDate(agent.created_at)} />
        <StatItem
          label="Total Cost"
          value={totalCost !== null ? `$${totalCost.toFixed(4)}` : 'N/A'}
          helperText="Across cycles"
        />
      </StatGroup>

      {/* Context Statistics */}
      {contextStats && (
        <YStack gap="$4">
          <Heading level={3}>Context Library</Heading>
          <XStack
            flexWrap="wrap"
            gap="$4"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            <Card variant="outlined" backgroundColor="$gray1" padding="$4" flex={1} minWidth={150}>
              <YStack gap="$1">
                <Heading level={2} color="$green11">
                  {contextStats.glossaryTermCount.toLocaleString()}
                </Heading>
                <Label size="xs">Glossary Terms</Label>
              </YStack>
            </Card>
            <Card variant="outlined" backgroundColor="$gray1" padding="$4" flex={1} minWidth={150}>
              <YStack gap="$1">
                <Heading level={2} color="$blue6">
                  {contextStats.chunkCount.toLocaleString()}
                </Heading>
                <Label size="xs">Context Chunks</Label>
              </YStack>
            </Card>
          </XStack>
        </YStack>
      )}

      {/* Context Generation Progress */}
      <YStack marginBottom="$6">
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$3">
          <Heading level={3}>Context Generation</Heading>
        </XStack>
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
