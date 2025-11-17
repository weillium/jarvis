'use client';

import React from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { useResetContextMutation } from '@/shared/hooks/use-mutations';

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
          {error instanceof Error ? error.message : (error ? String(error) : 'No agent found for this event')}
        </p>
      </div>
    );
  }

  const statusColor = getStatusColor(agent.status, agent.stage, blueprint?.status);
  const statusLabel = getStatusLabel(agent.status, agent.stage, blueprint?.status);

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
            Model Set
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {agent.model_set}
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
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Total Cost
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            {totalCost !== null ? (
              <>${totalCost.toFixed(4)}</>
            ) : (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>N/A</span>
            )}
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
            </div>
          </div>
        </div>
      )}

      {/* Context Generation Progress */}
      <div style={{ marginBottom: '24px' }}>
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
          embedded={true}
          onClearContext={agent && agent.status !== 'idle' ? handleReset : undefined}
          isClearing={isResetting}
        />
      </div>
    </div>
  );
}

