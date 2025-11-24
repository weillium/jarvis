'use client';

import { useState } from 'react';
import { ContextGenerationProgress } from './context-generation-progress';
import { BlueprintDisplay } from './blueprint-display';
import { PromptPreviewModal } from './prompt-preview-modal';
import { StageRegenerationControls } from './stage-regeneration-controls';
import { getStatusLabel } from './context-status-utils';

// Map status/stage to Badge variant
const getStatusBadgeVariant = (status: string, stage?: string | null, blueprintStatus?: string | null): 'default' | 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'gray' => {
  if (status === 'error') return 'red';
  if (status === 'ended') return 'gray';
  if (status === 'paused') return 'yellow';
  if (status === 'active') {
    return stage === 'testing' ? 'purple' : 'blue';
  }
  if (status === 'idle') {
    switch (stage) {
      case 'blueprint':
        if (blueprintStatus === 'generating') return 'blue';
        if (blueprintStatus === 'ready') return 'yellow';
        if (blueprintStatus === 'approved') return 'green';
        if (blueprintStatus === 'error') return 'red';
        return 'purple';
      case 'blueprint_generating':
        return 'blue';
      case 'researching':
      case 'building_glossary':
      case 'building_chunks':
      case 'regenerating_research':
      case 'regenerating_glossary':
      case 'regenerating_chunks':
        return 'yellow';
      case 'context_complete':
        return 'green';
      case 'testing':
        return 'purple';
      default:
        return 'gray';
    }
  }
  return 'gray';
};
import {
  useStartContextGenerationMutation,
  useRegenerateStageMutation,
  useApproveBlueprintMutation,
} from '@/shared/hooks/use-mutations';
import { useContextStatusQuery } from '@/shared/hooks/use-context-status-query';
import { YStack, XStack, Text, Card, Alert, EmptyStateCard, LoadingState, Body, Badge } from '@jarvis/ui-core';

interface ContextGenerationPanelProps {
  eventId: string;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
  onClearContext?: () => void;
  isClearing?: boolean;
}

export function ContextGenerationPanel({ eventId, embedded = false, onClearContext, isClearing = false }: ContextGenerationPanelProps) {
  const { data: statusData, error: statusError, refetch: refetchStatus } = useContextStatusQuery(eventId);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptPreviewError, setPromptPreviewError] = useState<string | null>(null);
  const [promptPreview, setPromptPreview] = useState<{
    system: string;
    user: string;
    event: {
      title: string;
      topic: string;
      hasDocuments: boolean;
      documentCount: number;
    };
  } | null>(null);
  // Mutation hooks
  const startContextGenerationMutation = useStartContextGenerationMutation(eventId);
  const regenerateStageMutation = useRegenerateStageMutation(eventId);
  const approveBlueprintMutation = useApproveBlueprintMutation(eventId);

  // Track which stage is currently regenerating
  const [currentRegeneratingStage, setCurrentRegeneratingStage] = useState<string | null>(null);

  // Get mutation states
  const approving = approveBlueprintMutation.isPending;
  const isRegenerating = startContextGenerationMutation.isPending; // Blueprint start/regenerate uses same mutation
  const regeneratingStage = regenerateStageMutation.isPending ? currentRegeneratingStage : null;
  
  // Consolidated error handling
  const getErrorMessage = (): string | null => {
    if (promptPreviewError) {
      return promptPreviewError;
    }
    if (statusError) {
      return statusError instanceof Error ? statusError.message : 'Failed to fetch status';
    }
    if (regenerateStageMutation.error) {
      return regenerateStageMutation.error instanceof Error ? regenerateStageMutation.error.message : 'Failed to regenerate stage';
    }
    if (startContextGenerationMutation.error) {
      return startContextGenerationMutation.error instanceof Error ? startContextGenerationMutation.error.message : 'Failed to start context generation';
    }
    if (approveBlueprintMutation.error) {
      return approveBlueprintMutation.error instanceof Error ? approveBlueprintMutation.error.message : 'Failed to approve blueprint';
    }
    return null;
  };
  
  const consolidatedError = getErrorMessage();

  // Fetch prompt preview and show modal
  const fetchPromptPreview = async () => {
    try {
      const res = await fetch(`/api/context/${eventId}/prompt-preview`);
      const data = await res.json();
      if (data.ok && data.prompt) {
        setPromptPreview({
          system: data.prompt.system,
          user: data.prompt.user,
          event: data.event,
        });
        setShowPromptPreview(true);
        setPromptPreviewError(null);
      } else {
        setPromptPreviewError(data.error || 'Failed to fetch prompt preview');
      }
    } catch (err) {
      console.error('Failed to fetch prompt preview:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch prompt preview';
      setPromptPreviewError(errorMessage);
    }
  };

  // Start/regenerate context generation (consolidated - called after user confirms in modal)
  // The endpoint now handles both start and regenerate cases automatically
  const actuallyStartOrRegenerate = () => {
    setShowPromptPreview(false);
    setPromptPreviewError(null); // Clear any previous errors
    startContextGenerationMutation.mutate(undefined, {
      onSuccess: () => {
        // React Query will automatically refetch status
        refetchStatus();
      },
      onError: () => {
        // Error is handled by consolidated error display
      },
    });
  };

  // Handle regenerate blueprint (shows prompt preview first)
  const handleRegenerate = async () => {
    await fetchPromptPreview();
  };

  // Handle stage regeneration (research, glossary, chunks)
  const handleRegenerateStage = (stage: 'research' | 'glossary' | 'chunks') => {
    setCurrentRegeneratingStage(stage);
    setPromptPreviewError(null); // Clear any previous errors
    regenerateStageMutation.mutate(stage, {
      onSuccess: () => {
        // React Query will automatically refetch status
        refetchStatus();
      },
      onError: () => {
        // Error is handled by consolidated error display
      },
      onSettled: () => {
        setCurrentRegeneratingStage(null);
      },
    });
  };

  // Approve blueprint
  const handleApprove = () => {
    setPromptPreviewError(null); // Clear any previous errors
    approveBlueprintMutation.mutate(undefined, {
      onSuccess: () => {
        // React Query will automatically refetch status
        refetchStatus();
      },
      onError: () => {
        // Error is handled by consolidated error display
      },
    });
  };

  // Enhanced state logic based on combined agent + blueprint status
  const canApprove = statusData?.agent?.status === 'idle' && 
                     statusData?.agent?.stage === 'blueprint' && 
                     statusData?.blueprint?.status === 'ready';
  
  const showBlueprint = statusData?.blueprint?.status === 'ready' || 
                        statusData?.blueprint?.status === 'approved';
  
  // Determine if we should show "Start Context Generation" button
  const canStartGeneration = 
    // No agent stage set yet
    (!statusData?.agent?.stage) ||
    // Or agent is in blueprint stage but no blueprint exists or blueprint is in error
    (statusData?.agent?.stage === 'blueprint' && 
     (!statusData?.blueprint || statusData?.blueprint?.status === 'error'));
  
  // Determine if we should show "Regenerate Blueprint" button
  const canRegenerateBlueprint = 
    statusData?.blueprint?.status === 'ready' || 
    statusData?.blueprint?.status === 'approved';
  
  // Check for blueprint errors
  const hasBlueprintError = statusData?.blueprint?.status === 'error';
  
  // Check for agent errors
  const hasAgentError = statusData?.agent?.status === 'error';

  // Check if context generation is actively running
  const isContextGenerationRunning = statusData?.agent?.status === 'idle' && 
    (statusData?.agent?.stage === 'researching' || 
     statusData?.agent?.stage === 'building_glossary' || 
     statusData?.agent?.stage === 'building_chunks' ||
     statusData?.agent?.stage === 'regenerating_research' ||
     statusData?.agent?.stage === 'regenerating_glossary' ||
     statusData?.agent?.stage === 'regenerating_chunks');

  // Helper function to determine if stage regeneration controls should be shown
  const shouldShowStageControls = (): boolean => {
    if (!statusData?.agent) return false;
    
    // Always show when embedded
    if (embedded) return true;
    
    // Show when we can start/regenerate blueprint
    if (canStartGeneration || canRegenerateBlueprint) return true;
    
    // Show during active generation stages
    if (statusData.agent.status === 'idle') {
      const activeStages = [
        'context_complete',
        'researching',
        'building_glossary',
        'building_chunks',
        'regenerating_research',
        'regenerating_glossary',
        'regenerating_chunks',
      ];
      return activeStages.includes(statusData.agent.stage || '');
    }
    
    // Show on error
    if (statusData.agent.status === 'error') return true;
    
    return false;
  };

  // Show loading state when statusData is null (initial load)
  if (statusData === null) {
    return (
      <LoadingState
        title="Loading context generation status"
        description="Fetching the current agent and blueprint state."
      />
    );
  }

  if (embedded) {
    return (
      <YStack>
        {/* Consolidated error messages */}
        {consolidatedError && (
          <Alert variant="error" marginBottom="$4">
            {consolidatedError}
          </Alert>
        )}
        
        {/* Blueprint error message */}
        {hasBlueprintError && statusData?.blueprint && (
          <Alert variant="error" marginBottom="$4">
            <YStack gap="$2">
              <Text fontWeight="600" margin={0}>Blueprint Generation Failed</Text>
              <Text margin={0}>
                Blueprint generation encountered an error. You can try generating a new blueprint.
              </Text>
            </YStack>
          </Alert>
        )}
        
        {/* Agent error message */}
        {hasAgentError && (
          <Alert variant="error" marginBottom="$4">
            <YStack gap="$2">
              <Text fontWeight="600" margin={0}>Agent Error</Text>
              <Text margin={0}>
                The agent encountered an error during context generation. Please check the logs or try resetting.
              </Text>
            </YStack>
          </Alert>
        )}

        {/* No agent state */}
        {statusData?.agent === null && (
          <EmptyStateCard
            title="No agent configured"
            description="Create an event with an agent before starting context generation."
            padding="$4"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$gray1"
            titleLevel={5}
            align="start"
          />
        )}

        {/* Progress component - always show when agent exists */}
        {statusData && statusData.agent && (
          <YStack marginBottom="$5">
            <ContextGenerationProgress
              status={statusData.agent.status}
              stage={statusData.stage}
              progress={statusData.progress}
              blueprintStatus={statusData?.blueprint?.status}
            />
          </YStack>
        )}

        {/* Stage Regeneration Controls - Modular Regeneration */}
        {shouldShowStageControls() && (
          <StageRegenerationControls
            embedded={embedded}
            canStartGeneration={canStartGeneration}
            canRegenerateBlueprint={canRegenerateBlueprint}
            canApprove={canApprove}
            isRegenerating={isRegenerating}
            regeneratingStage={regeneratingStage}
            approving={approving}
            isContextGenerationRunning={isContextGenerationRunning}
            isClearing={isClearing}
            statusData={statusData ?? null}
            onStartGeneration={() => handleRegenerate()}
            onRegenerateBlueprint={() => handleRegenerate()}
            onApprove={handleApprove}
            onRegenerateStage={handleRegenerateStage}
            onClearContext={onClearContext}
          />
        )}

        {/* Prompt Preview Modal */}
        <PromptPreviewModal
          isOpen={showPromptPreview}
          promptPreview={promptPreview}
          isRegenerating={isRegenerating}
          onClose={() => {
            setShowPromptPreview(false);
            setPromptPreview(null);
          }}
          onConfirm={actuallyStartOrRegenerate}
        />
      </YStack>
    );
  }

  return (
    <Card variant="outlined" padding="$6" marginBottom="$6">
      {/* Header - only show when not embedded */}
      <XStack justifyContent="space-between" alignItems="center" marginBottom="$5">
        <Text fontSize="$5" fontWeight="600" color="$color" margin={0}>
          Context Generation
        </Text>
        {statusData?.agent && (
          <Badge
            variant={getStatusBadgeVariant(statusData.agent.status, statusData.agent.stage, statusData?.blueprint?.status)}
            size="sm"
          >
            {getStatusLabel(statusData.agent.status, statusData.agent.stage, statusData?.blueprint?.status).toUpperCase()}
          </Badge>
        )}
      </XStack>

      {/* Consolidated error messages */}
      {consolidatedError && (
        <Alert variant="error" marginBottom="$4">
          {consolidatedError}
        </Alert>
      )}
      
      {/* Blueprint error message */}
      {hasBlueprintError && statusData?.blueprint && (
        <Alert variant="error" marginBottom="$4">
          <YStack gap="$2">
            <Text fontWeight="600" margin={0}>Blueprint Generation Failed</Text>
            <Text margin={0}>
              Blueprint generation encountered an error. You can try generating a new blueprint.
            </Text>
          </YStack>
        </Alert>
      )}
      
      {/* Agent error message */}
      {hasAgentError && (
        <Alert variant="error" marginBottom="$4">
          <YStack gap="$2">
            <Text fontWeight="600" margin={0}>Agent Error</Text>
            <Text margin={0}>
              The agent encountered an error during context generation. Please check the logs or try resetting.
            </Text>
          </YStack>
        </Alert>
      )}

      {/* No agent state */}
      {statusData?.agent === null && (
        <EmptyStateCard
          title="No agent configured"
          description="Create an event with an agent before starting context generation."
          padding="$4"
          borderWidth={1}
          borderColor="$borderColor"
          backgroundColor="$gray1"
          titleLevel={5}
          align="start"
          marginBottom="$4"
        />
      )}

      {/* Progress component - always show when agent exists */}
      {statusData && statusData.agent && (
        <YStack marginBottom="$5">
          <ContextGenerationProgress
            status={statusData.agent.status}
            stage={statusData.stage}
            progress={statusData.progress}
            blueprintStatus={statusData?.blueprint?.status}
          />
        </YStack>
      )}

      {/* Stage Regeneration Controls - Modular Regeneration */}
      {shouldShowStageControls() && (
        <StageRegenerationControls
          embedded={embedded}
          canStartGeneration={canStartGeneration}
          canRegenerateBlueprint={canRegenerateBlueprint}
          canApprove={canApprove}
          isRegenerating={isRegenerating}
          regeneratingStage={regeneratingStage}
          approving={approving}
          isContextGenerationRunning={isContextGenerationRunning}
          isClearing={isClearing}
          statusData={statusData ?? null}
          onStartGeneration={() => handleRegenerate()}
          onRegenerateBlueprint={() => handleRegenerate()}
          onApprove={handleApprove}
          onRegenerateStage={handleRegenerateStage}
          onClearContext={onClearContext}
        />
      )}

      {/* Blueprint display - only show when not embedded */}
      {showBlueprint && statusData?.blueprint && (
        <YStack marginBottom="$5">
          <BlueprintDisplay
            eventId={eventId}
            onRegenerate={handleRegenerate}
          />
        </YStack>
      )}

      {/* Prompt Preview Modal */}
      <PromptPreviewModal
        isOpen={showPromptPreview}
        promptPreview={promptPreview}
        isRegenerating={isRegenerating}
        onClose={() => {
          setShowPromptPreview(false);
          setPromptPreview(null);
        }}
        onConfirm={actuallyStartOrRegenerate}
      />
    </Card>
  );
}
