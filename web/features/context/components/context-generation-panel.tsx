'use client';

import { useState } from 'react';
import { ContextGenerationProgress } from './context-generation-progress';
import { BlueprintDisplay } from './blueprint-display';
import { PromptPreviewModal } from './prompt-preview-modal';
import { StageRegenerationControls } from './stage-regeneration-controls';
import { getStatusColor, getStatusLabel } from './context-status-utils';
import {
  useStartContextGenerationMutation,
  useRegenerateStageMutation,
  useApproveBlueprintMutation,
} from '@/shared/hooks/use-mutations';
import { useContextStatusQuery } from '@/shared/hooks/use-context-status-query';

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
      <div style={{
        background: embedded ? 'transparent' : '#ffffff',
        border: embedded ? 'none' : '1px solid #e2e8f0',
        borderRadius: embedded ? '0' : '12px',
        padding: embedded ? '16px' : '24px',
        marginBottom: embedded ? '0' : '24px',
        textAlign: 'center',
        color: '#64748b',
      }}>
        Loading context generation status...
      </div>
    );
  }

  return (
    <div style={{
      background: embedded ? 'transparent' : '#ffffff',
      border: embedded ? 'none' : '1px solid #e2e8f0',
      borderRadius: embedded ? '0' : '12px',
      padding: embedded ? '0' : '24px',
      marginBottom: embedded ? '0' : '24px',
    }}>
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}>
            Context Generation
          </h3>
          {statusData?.agent && (
            <span style={{
              display: 'inline-block',
              padding: '6px 12px',
              background: getStatusColor(statusData.agent.status, statusData.agent.stage, statusData?.blueprint?.status),
              color: '#ffffff',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              textTransform: 'uppercase',
            }}>
              {getStatusLabel(statusData.agent.status, statusData.agent.stage, statusData?.blueprint?.status)}
            </span>
          )}
        </div>
      )}

      {/* Consolidated error messages */}
      {consolidatedError && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          color: '#991b1b',
          fontSize: '14px',
        }}>
          {consolidatedError}
        </div>
      )}
      
      {/* Blueprint error message */}
      {hasBlueprintError && statusData?.blueprint && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          color: '#991b1b',
          fontSize: '14px',
        }}>
          <strong>Blueprint Generation Failed</strong>
          <p style={{ margin: '8px 0 0 0' }}>
            Blueprint generation encountered an error. You can try generating a new blueprint.
          </p>
        </div>
      )}
      
      {/* Agent error message */}
      {hasAgentError && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          color: '#991b1b',
          fontSize: '14px',
        }}>
          <strong>Agent Error</strong>
          <p style={{ margin: '8px 0 0 0' }}>
            The agent encountered an error during context generation. Please check the logs or try resetting.
          </p>
        </div>
      )}

      {/* No agent state */}
      {statusData?.agent === null && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: '#64748b',
        }}>
          <p style={{ margin: '0 0 16px 0' }}>
            No agent found for this event. Please create an event with an agent first.
          </p>
        </div>
      )}

      {/* Progress component - always show when agent exists */}
      {statusData && statusData.agent && (
        <div style={{ marginBottom: '20px' }}>
          <ContextGenerationProgress
            status={statusData.agent.status}
            stage={statusData.stage}
            progress={statusData.progress}
            blueprintStatus={statusData?.blueprint?.status}
          />
        </div>
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
          statusData={statusData}
          onStartGeneration={() => handleRegenerate()}
          onRegenerateBlueprint={() => handleRegenerate()}
          onApprove={handleApprove}
          onRegenerateStage={handleRegenerateStage}
          onClearContext={onClearContext}
        />
      )}

      {/* Blueprint display - only show when not embedded */}
      {!embedded && showBlueprint && statusData?.blueprint && (
        <div style={{ marginBottom: '20px' }}>
          <BlueprintDisplay
            eventId={eventId}
            onRegenerate={handleRegenerate}
          />
        </div>
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
    </div>
  );
}
