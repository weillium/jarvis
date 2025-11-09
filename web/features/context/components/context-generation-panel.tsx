'use client';

import { useState } from 'react';
import { ContextGenerationProgress } from './context-generation-progress';
import { BlueprintDisplay } from './blueprint-display';
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
        <div style={{
          marginBottom: '20px',
          ...(embedded ? {} : {
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }),
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '8px',
          }}>
            {/* Start Context Generation button - show when no blueprint or blueprint is in error */}
            {canStartGeneration && (
              <button
                onClick={() => handleRegenerate()}
                disabled={!!isRegenerating || !!regeneratingStage}
                style={{
                  padding: '10px 16px',
                  background: (isRegenerating) 
                    ? '#94a3b8' 
                    : '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: (isRegenerating || regeneratingStage) 
                    ? 'not-allowed' 
                    : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {isRegenerating 
                  ? 'Starting...'
                  : 'Start Context Generation'}
              </button>
            )}
            
            {/* Regenerate Blueprint button - show when blueprint is ready or approved */}
            {canRegenerateBlueprint && (
              <button
                onClick={() => handleRegenerate()}
                disabled={!!isRegenerating || !!regeneratingStage || isContextGenerationRunning}
                style={{
                  padding: '10px 16px',
                  background: (isRegenerating || isContextGenerationRunning) 
                    ? '#94a3b8' 
                    : '#8b5cf6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: (isRegenerating || regeneratingStage || isContextGenerationRunning) 
                    ? 'not-allowed' 
                    : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {isRegenerating 
                  ? 'Regenerating...'
                  : 'Regenerate Blueprint'}
              </button>
            )}
            
            {/* Approve Blueprint button - show when blueprint is ready */}
            {canApprove && (
              <button
                onClick={handleApprove}
                disabled={approving}
                style={{
                  padding: '10px 16px',
                  background: approving 
                    ? '#94a3b8' 
                    : '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: approving 
                    ? 'not-allowed' 
                    : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {approving ? 'Approving...' : 'Approve Blueprint'}
              </button>
            )}
            {/* Stage regeneration buttons - only show when blueprint is approved */}
            {statusData?.blueprint?.status === 'approved' && (
              <>
                <button
                  onClick={() => handleRegenerateStage('research')}
                  disabled={
                    !!regeneratingStage || 
                    isContextGenerationRunning ||
                    !statusData?.hasResearch ||
                    (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')
                  }
                  style={{
                    padding: '10px 16px',
                    background: (regeneratingStage === 'research' || isContextGenerationRunning || !statusData?.hasResearch || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                      ? '#94a3b8' 
                      : '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: (regeneratingStage || isContextGenerationRunning || !statusData?.hasResearch || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                      ? 'not-allowed' 
                      : 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {(regeneratingStage === 'research' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                    ? 'Regenerating...' 
                    : 'Regenerate Research'}
                </button>
                <button
                  onClick={() => handleRegenerateStage('glossary')}
                  disabled={
                    !!regeneratingStage || 
                    isContextGenerationRunning ||
                    !statusData?.hasGlossary ||
                    (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')
                  }
                  style={{
                    padding: '10px 16px',
                    background: (regeneratingStage === 'glossary' || isContextGenerationRunning || !statusData?.hasGlossary || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                      ? '#94a3b8' 
                      : '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: (regeneratingStage || isContextGenerationRunning || !statusData?.hasGlossary || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                      ? 'not-allowed' 
                      : 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {(regeneratingStage === 'glossary' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                    ? 'Regenerating...' 
                    : 'Regenerate Glossary'}
                </button>
                <button
                  onClick={() => handleRegenerateStage('chunks')}
                  disabled={
                    !!regeneratingStage || 
                    isContextGenerationRunning ||
                    !statusData?.hasChunks ||
                    (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')
                  }
                  style={{
                    padding: '10px 16px',
                    background: (regeneratingStage === 'chunks' || isContextGenerationRunning || !statusData?.hasChunks || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                      ? '#94a3b8' 
                      : '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: (regeneratingStage || isContextGenerationRunning || !statusData?.hasChunks || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                      ? 'not-allowed' 
                      : 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {(regeneratingStage === 'chunks' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                    ? 'Regenerating...' 
                    : 'Regenerate Chunks'}
                </button>
              </>
            )}
            {onClearContext && (
              <button
                onClick={onClearContext}
                disabled={isClearing || !!isRegenerating || !!regeneratingStage}
                style={{
                  padding: '10px 16px',
                  background: (isClearing || isRegenerating || regeneratingStage) 
                    ? '#94a3b8' 
                    : '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: (isClearing || isRegenerating || regeneratingStage) 
                    ? 'not-allowed' 
                    : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {isClearing ? 'Clearing...' : 'Clear Context'}
              </button>
            )}
          </div>
        </div>
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
      {showPromptPreview && promptPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '900px',
            maxHeight: '90vh',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            <h2 style={{
              margin: '0 0 20px 0',
              fontSize: '20px',
              fontWeight: '600',
              color: '#1e293b',
            }}>
              Confirm Prompt Before Generation
            </h2>

            {/* Event Info */}
            <div style={{
              background: '#f1f5f9',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                Event Information
              </h3>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
                <strong>Title:</strong> {promptPreview.event.title}
              </p>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
                <strong>Topic:</strong> {promptPreview.event.topic}
              </p>
              {promptPreview.event.hasDocuments && (
                <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
                  <strong>Documents:</strong> {promptPreview.event.documentCount} document(s) available
                </p>
              )}
            </div>

            {/* User Prompt - System prompt is embedded and doesn't need to be shown separately */}
            <div style={{ marginBottom: '20px', flex: 1, overflow: 'auto' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                User Prompt
              </h3>
              <pre style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                color: '#334155',
                overflow: 'auto',
                maxHeight: '300px',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              }}>
                {promptPreview.user}
              </pre>
            </div>

            {/* Modal Actions */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              borderTop: '1px solid #e2e8f0',
              paddingTop: '16px',
            }}>
              <button
                onClick={() => {
                  setShowPromptPreview(false);
                  setPromptPreview(null);
                }}
                style={{
                  background: '#ffffff',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={actuallyStartOrRegenerate}
                disabled={isRegenerating}
                style={{
                  background: isRegenerating ? '#94a3b8' : '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isRegenerating ? 'not-allowed' : 'pointer',
                }}
              >
                {isRegenerating ? 'Starting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusColor(status: string, stage?: string | null, blueprintStatus?: string | null): string {
  if (status === 'error') return '#ef4444'; // red
  if (status === 'ended') return '#64748b'; // gray
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
      case 'blueprint_generating':
        return '#3b82f6'; // blue - actively generating
      case 'researching': return '#f59e0b'; // amber
      case 'building_glossary': return '#f59e0b'; // amber
      case 'building_chunks': return '#f59e0b'; // amber
      case 'regenerating_research': return '#f59e0b'; // amber
      case 'regenerating_glossary': return '#f59e0b'; // amber
      case 'regenerating_chunks': return '#f59e0b'; // amber
      case 'context_complete': return '#10b981'; // green
      case 'testing': return '#8b5cf6'; // purple
      default: return '#64748b'; // gray
    }
  }
  return '#6b7280';
}

function getStatusLabel(status: string, stage?: string | null, blueprintStatus?: string | null): string {
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
      case 'blueprint_generating':
        return 'Generating Blueprint';
      case 'researching': return 'Researching';
      case 'building_glossary': return 'Building Glossary';
      case 'building_chunks': return 'Building Chunks';
      case 'regenerating_research': return 'Regenerating Research';
      case 'regenerating_glossary': return 'Regenerating Glossary';
      case 'regenerating_chunks': return 'Regenerating Chunks';
      case 'context_complete': return 'Context Complete';
      case 'testing': return 'Testing';
      default: return 'Idle';
    }
  }
  return 'Unknown';
}
