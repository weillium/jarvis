'use client';

import { useState, useEffect } from 'react';
import { ContextGenerationProgress } from './context-generation-progress';
import { BlueprintDisplay } from './blueprint-display';

interface ContextGenerationPanelProps {
  eventId: string;
  agentStatus: string | null;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
  onClearContext?: () => void;
  isClearing?: boolean;
}

interface StatusData {
  ok: boolean;
  agent: {
    id: string;
    status: string;
    created_at: string;
  } | null;
  blueprint: {
    id: string;
    status: string;
    created_at: string;
    approved_at: string | null;
    execution_started_at: string | null;
    completed_at: string | null;
    target_chunk_count: number | null;
    estimated_cost: number | null;
  } | null;
  stage: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
}

export function ContextGenerationPanel({ eventId, agentStatus, embedded = false, onClearContext, isClearing = false }: ContextGenerationPanelProps) {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
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
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerateFlow, setIsRegenerateFlow] = useState(false);
  const [regeneratingStage, setRegeneratingStage] = useState<string | null>(null);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/context/${eventId}/status`);
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err: any) {
      console.error('Failed to fetch status:', err);
      setError(err.message || 'Failed to fetch status');
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!eventId) return;
    fetchStatus();
  }, [eventId]);

  // Poll for status updates (every 3 seconds)
  useEffect(() => {
    if (!eventId) return;

    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);

    setPollingInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [eventId]);

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
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch prompt preview');
      }
    } catch (err: any) {
      console.error('Failed to fetch prompt preview:', err);
      setError(err.message || 'Failed to fetch prompt preview');
    }
  };

  // Actually start context generation (called after user confirms in modal)
  const actuallyStartGeneration = async () => {
    setStarting(true);
    setError(null);
    setShowPromptPreview(false);

    try {
      const res = await fetch(`/api/context/${eventId}/start`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        // Immediately fetch updated status
        await fetchStatus();
      } else {
        setError(data.error || 'Failed to start context generation');
      }
    } catch (err: any) {
      console.error('Failed to start context generation:', err);
      setError(err.message || 'Failed to start context generation');
    } finally {
      setStarting(false);
    }
  };

  // Start context generation (shows prompt preview first)
  const handleStart = async () => {
    setIsRegenerateFlow(false);
    await fetchPromptPreview();
  };

  // Handle regenerate blueprint (shows prompt preview first)
  const handleRegenerate = async () => {
    setIsRegenerateFlow(true);
    await fetchPromptPreview();
  };

  // Handle stage regeneration (research, glossary, chunks)
  const handleRegenerateStage = async (stage: 'research' | 'glossary' | 'chunks') => {
    setRegeneratingStage(stage);
    setRegenerationError(null);

    try {
      const res = await fetch(`/api/context/${eventId}/regenerate?stage=${stage}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        // Immediately fetch updated status to show progress
        await fetchStatus();
      } else {
        setRegenerationError(data.error || `Failed to regenerate ${stage}`);
      }
    } catch (err: any) {
      console.error(`Failed to regenerate ${stage}:`, err);
      setRegenerationError(err.message || `Failed to regenerate ${stage}`);
    } finally {
      setRegeneratingStage(null);
    }
  };

  // Actually regenerate blueprint (called after user confirms in modal)
  const actuallyRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);
    setShowPromptPreview(false);
    setIsRegenerateFlow(false);

    try {
      const res = await fetch(`/api/context/${eventId}/blueprint/regenerate`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        // Immediately fetch updated status
        await fetchStatus();
      } else {
        setError(data.error || 'Failed to regenerate blueprint');
      }
    } catch (err: any) {
      console.error('Failed to regenerate blueprint:', err);
      setError(err.message || 'Failed to regenerate blueprint');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Approve blueprint
  const handleApprove = async () => {
    setApproving(true);
    setError(null);

    try {
      const res = await fetch(`/api/context/${eventId}/blueprint`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        // Immediately fetch updated status
        await fetchStatus();
      } else {
        setError(data.error || 'Failed to approve blueprint');
      }
    } catch (err: any) {
      console.error('Failed to approve blueprint:', err);
      setError(err.message || 'Failed to approve blueprint');
    } finally {
      setApproving(false);
    }
  };

  const canStart = statusData?.agent?.status === 'idle' || 
                   statusData?.agent?.status === 'prepping' || // Legacy status support
                   statusData?.agent?.status === 'blueprint_ready' ||
                   (statusData?.agent?.status === 'error' && !statusData?.blueprint);
  const canApprove = statusData?.agent?.status === 'blueprint_ready' && 
                     statusData?.blueprint?.status === 'ready';
  const showBlueprint = statusData?.blueprint?.status === 'ready' || 
                        statusData?.blueprint?.status === 'approved' ||
                        statusData?.blueprint?.status === 'completed';

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
              background: getStatusColor(statusData.agent.status),
              color: '#ffffff',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              textTransform: 'uppercase',
            }}>
              {getStatusLabel(statusData.agent.status)}
            </span>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          color: '#991b1b',
          fontSize: '14px',
        }}>
          {error}
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

      {/* Start button */}
      {statusData?.agent && canStart && (
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={handleStart}
            disabled={starting}
            style={{
              background: starting ? '#94a3b8' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: starting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {starting ? 'Starting...' : 'Start Context Generation'}
          </button>
        </div>
      )}

      {/* Progress component */}
      {statusData && (statusData.agent?.status === 'blueprint_generating' ||
                      statusData.agent?.status === 'blueprint_approved' ||
                      statusData.agent?.status === 'researching' ||
                      statusData.agent?.status === 'regenerating_research' ||
                      statusData.agent?.status === 'building_glossary' ||
                      statusData.agent?.status === 'regenerating_glossary' ||
                      statusData.agent?.status === 'building_chunks' ||
                      statusData.agent?.status === 'regenerating_chunks' ||
                      statusData.agent?.status === 'context_complete') && (
        <div style={{ marginBottom: '20px' }}>
          <ContextGenerationProgress
            status={statusData.agent.status}
            stage={statusData.stage}
            progress={statusData.progress}
          />
        </div>
      )}

      {/* Stage Regeneration Controls - Modular Regeneration */}
      {(statusData?.agent?.status === 'context_complete' || 
        statusData?.agent?.status === 'error' ||
        statusData?.agent?.status === 'blueprint_approved' ||
        statusData?.agent?.status === 'researching' ||
        statusData?.agent?.status === 'building_glossary' ||
        statusData?.agent?.status === 'building_chunks' ||
        statusData?.agent?.status === 'regenerating_research' ||
        statusData?.agent?.status === 'regenerating_glossary' ||
        statusData?.agent?.status === 'regenerating_chunks') && (
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
            <button
              onClick={() => handleRegenerate()}
              disabled={!!isRegenerating || !!regeneratingStage}
              style={{
                padding: '10px 16px',
                background: (isRegenerating) 
                  ? '#94a3b8' 
                  : (statusData?.blueprint ? '#8b5cf6' : '#3b82f6'),
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
                ? (statusData?.blueprint ? 'Regenerating...' : 'Starting...')
                : (statusData?.blueprint ? 'Regenerate Blueprint' : 'Start Context Generation')}
            </button>
            <button
              onClick={() => handleRegenerateStage('research')}
              disabled={!!regeneratingStage || statusData?.agent?.status === 'regenerating_research' || !statusData?.blueprint}
              style={{
                padding: '10px 16px',
                background: (regeneratingStage === 'research' || statusData?.agent?.status === 'regenerating_research' || !statusData?.blueprint) 
                  ? '#94a3b8' 
                  : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: (regeneratingStage || statusData?.agent?.status === 'regenerating_research' || !statusData?.blueprint) 
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'background 0.2s',
                opacity: !statusData?.blueprint ? 0.6 : 1,
              }}
            >
              {(regeneratingStage === 'research' || statusData?.agent?.status === 'regenerating_research') 
                ? 'Regenerating...' 
                : 'Regenerate Research'}
            </button>
            <button
              onClick={() => handleRegenerateStage('glossary')}
              disabled={!!regeneratingStage || statusData?.agent?.status === 'regenerating_glossary' || !statusData?.blueprint}
              style={{
                padding: '10px 16px',
                background: (regeneratingStage === 'glossary' || statusData?.agent?.status === 'regenerating_glossary' || !statusData?.blueprint) 
                  ? '#94a3b8' 
                  : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: (regeneratingStage || statusData?.agent?.status === 'regenerating_glossary' || !statusData?.blueprint) 
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'background 0.2s',
                opacity: !statusData?.blueprint ? 0.6 : 1,
              }}
            >
              {(regeneratingStage === 'glossary' || statusData?.agent?.status === 'regenerating_glossary') 
                ? 'Regenerating...' 
                : 'Regenerate Glossary'}
            </button>
            <button
              onClick={() => handleRegenerateStage('chunks')}
              disabled={!!regeneratingStage || statusData?.agent?.status === 'regenerating_chunks' || !statusData?.blueprint}
              style={{
                padding: '10px 16px',
                background: (regeneratingStage === 'chunks' || statusData?.agent?.status === 'regenerating_chunks' || !statusData?.blueprint) 
                  ? '#94a3b8' 
                  : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: (regeneratingStage || statusData?.agent?.status === 'regenerating_chunks' || !statusData?.blueprint) 
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'background 0.2s',
                opacity: !statusData?.blueprint ? 0.6 : 1,
              }}
            >
              {(regeneratingStage === 'chunks' || statusData?.agent?.status === 'regenerating_chunks') 
                ? 'Regenerating...' 
                : 'Regenerate Chunks'}
            </button>
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
          {regenerationError && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#991b1b',
              fontSize: '12px',
            }}>
              {regenerationError}
            </div>
          )}
        </div>
      )}

      {/* Blueprint display - only show when not embedded */}
      {!embedded && showBlueprint && statusData?.blueprint && (
        <div style={{ marginBottom: '20px' }}>
          <BlueprintDisplay
            eventId={eventId}
            onApprove={handleApprove}
            approving={approving}
            canApprove={canApprove}
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
                  setIsRegenerateFlow(false);
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
                onClick={() => {
                  if (isRegenerateFlow) {
                    actuallyRegenerate();
                  } else {
                    actuallyStartGeneration();
                  }
                }}
                disabled={starting || isRegenerating}
                style={{
                  background: (starting || isRegenerating) ? '#94a3b8' : '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: (starting || isRegenerating) ? 'not-allowed' : 'pointer',
                }}
              >
                {(starting || isRegenerating) 
                  ? (isRegenerating ? 'Regenerating...' : 'Starting...') 
                  : (isRegenerateFlow ? 'Confirm & Regenerate' : 'Confirm & Start Generation')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'idle':
      return '#64748b'; // gray
    case 'blueprint_generating':
      return '#3b82f6'; // blue
    case 'blueprint_ready':
      return '#10b981'; // green
    case 'blueprint_approved':
    case 'researching':
    case 'regenerating_research':
    case 'building_glossary':
    case 'regenerating_glossary':
    case 'building_chunks':
    case 'regenerating_chunks':
      return '#f59e0b'; // amber
    case 'context_complete':
      return '#10b981'; // green
    case 'ready':
    case 'running':
      return '#10b981'; // green
    case 'error':
      return '#ef4444'; // red
    default:
      return '#64748b'; // gray
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'blueprint_generating':
      return 'Generating Blueprint';
    case 'blueprint_ready':
      return 'Blueprint Ready';
    case 'blueprint_approved':
      return 'Blueprint Approved';
    case 'researching':
      return 'Researching';
    case 'regenerating_research':
      return 'Regenerating Research';
    case 'building_glossary':
      return 'Building Glossary';
    case 'regenerating_glossary':
      return 'Regenerating Glossary';
    case 'building_chunks':
      return 'Building Chunks';
    case 'regenerating_chunks':
      return 'Regenerating Chunks';
    case 'context_complete':
      return 'Complete';
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Running';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}
