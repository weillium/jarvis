'use client';

import { useState } from 'react';
import { useAgentInfo } from '@/shared/hooks/useAgentInfo';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';

interface AgentOverviewProps {
  eventId: string;
}

export function AgentOverview({ eventId }: AgentOverviewProps) {
  const { agent, contextStats, blueprint, loading, error, refetch } = useAgentInfo(eventId);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleReset = async () => {
    if (!confirm('Are you sure you want to invalidate all context components? This will require restarting context building.')) {
      return;
    }

    setIsResetting(true);
    setResetError(null);

    try {
      const res = await fetch(`/api/context/${eventId}/reset`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        // Refresh agent info
        await refetch();
      } else {
        setResetError(data.error || 'Failed to reset context');
      }
    } catch (err: any) {
      console.error('Failed to reset context:', err);
      setResetError(err.message || 'Failed to reset context');
    } finally {
      setIsResetting(false);
    }
  };

  const getStatusColor = (status: string | null): string => {
    if (!status) return '#6b7280';
    
    switch (status) {
      case 'idle':
        return '#64748b';
      case 'blueprint_generating':
        return '#3b82f6';
      case 'blueprint_ready':
        return '#10b981';
      case 'blueprint_approved':
      case 'researching':
      case 'building_glossary':
      case 'building_chunks':
        return '#f59e0b';
      case 'context_complete':
        return '#10b981';
      case 'prepping':
        return '#f59e0b';
      case 'ready':
        return '#10b981';
      case 'running':
        return '#3b82f6';
      case 'ended':
        return '#6b7280';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string | null): string => {
    if (!status) return 'Unknown';
    
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
        return 'Context Complete';
      case 'prepping':
        return 'Prepping';
      case 'ready':
        return 'Ready';
      case 'running':
        return 'Running';
      case 'ended':
        return 'Ended';
      case 'error':
        return 'Error';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block',
          width: '40px',
          height: '40px',
          border: '3px solid #e2e8f0',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{
          marginTop: '16px',
          color: '#64748b',
          fontSize: '14px',
        }}>
          Loading agent information...
        </p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div style={{
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        <p style={{
          color: '#ef4444',
          fontSize: '14px',
        }}>
          {error || 'No agent found for this event'}
        </p>
      </div>
    );
  }

  const statusColor = getStatusColor(agent.status);
  const statusLabel = getStatusLabel(agent.status);

  return (
    <div>
      {/* Agent Details Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '20px',
        marginBottom: '24px',
      }}>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Agent ID
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: '500',
            color: '#0f172a',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}>
            {agent.id.substring(0, 8)}...
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Status
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: statusColor,
          }}>
            {statusLabel}
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Model
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {agent.model}
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Created
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {formatDate(agent.created_at)}
          </div>
        </div>
      </div>

      {/* Context Statistics */}
      {contextStats && (
        <div style={{
          marginBottom: '24px',
          paddingBottom: '24px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <h4 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 16px 0',
          }}>
            Context Library
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
          }}>
            <div style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#10b981',
                marginBottom: '4px',
              }}>
                {contextStats.glossaryTermCount.toLocaleString()}
              </div>
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Glossary Terms
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#3b82f6',
                marginBottom: '4px',
              }}>
                {contextStats.chunkCount.toLocaleString()}
              </div>
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Context Chunks
              </div>
              {blueprint?.target_chunk_count && (
                <div style={{
                  fontSize: '11px',
                  color: '#94a3b8',
                  marginTop: '4px',
                }}>
                  Target: {blueprint.target_chunk_count.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Generation Progress */}
      <div>
        <h4 style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#0f172a',
          margin: '0 0 16px 0',
        }}>
          Context Generation Progress
        </h4>
        {resetError && (
          <div style={{
            marginBottom: '16px',
            padding: '8px 12px',
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '12px',
          }}>
            {resetError}
          </div>
        )}
        <ContextGenerationPanel 
          eventId={eventId} 
          agentStatus={agent.status} 
          embedded={true}
          onClearContext={agent && agent.status !== 'idle' ? handleReset : undefined}
          isClearing={isResetting}
        />
      </div>
    </div>
  );
}

