'use client';

import { useState, useEffect } from 'react';
import { ContextGenerationProgress } from './context-generation-progress';
import { BlueprintDisplay } from './blueprint-display';

interface ContextGenerationPanelProps {
  eventId: string;
  agentStatus: string | null;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
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

export function ContextGenerationPanel({ eventId, agentStatus, embedded = false }: ContextGenerationPanelProps) {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

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

  // Start context generation
  const handleStart = async () => {
    setStarting(true);
    setError(null);

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
                   statusData?.agent?.status === 'error';
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
      {/* Header */}
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
                      statusData.agent?.status === 'building_glossary' ||
                      statusData.agent?.status === 'building_chunks' ||
                      statusData.agent?.status === 'context_complete') && (
        <div style={{ marginBottom: '20px' }}>
          <ContextGenerationProgress
            status={statusData.agent.status}
            stage={statusData.stage}
            progress={statusData.progress}
          />
        </div>
      )}

      {/* Blueprint display */}
      {showBlueprint && statusData?.blueprint && (
        <div style={{ marginBottom: '20px' }}>
          <BlueprintDisplay
            eventId={eventId}
            onApprove={handleApprove}
            approving={approving}
            canApprove={canApprove}
          />
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
    case 'building_glossary':
    case 'building_chunks':
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
    case 'building_glossary':
      return 'Building Glossary';
    case 'building_chunks':
      return 'Building Chunks';
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
