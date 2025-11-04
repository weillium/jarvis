'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAgentInfo } from '@/shared/hooks/useAgentInfo';
import { useAgentSessions, AgentSessionStatus } from '@/shared/hooks/use-agent-sessions';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { TestTranscriptModal } from './test-transcript-modal';

interface AgentOverviewProps {
  eventId: string;
}

export function AgentOverview({ eventId }: AgentOverviewProps) {
  const { agent, contextStats, blueprint, loading, error, refetch } = useAgentInfo(eventId);
  const [hasActiveSessions, setHasActiveSessions] = useState(false);
  const [checkingSessions, setCheckingSessions] = useState(true);
  
  // Check if sessions exist and are in starting/active states before connecting
  const checkForActiveSessions = useCallback(async () => {
    if (!eventId) {
      setCheckingSessions(false);
      return;
    }
    
    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/check`);
      const data = await res.json();
      
      if (data.ok && data.hasActiveSessions) {
        setHasActiveSessions(true);
      } else {
        setHasActiveSessions(false);
      }
    } catch (err) {
      console.error('[AgentOverview] Failed to check for active sessions:', err);
      setHasActiveSessions(false);
    } finally {
      setCheckingSessions(false);
    }
  }, [eventId]);
  
  useEffect(() => {
    checkForActiveSessions();
    
    // Poll periodically to check for new sessions
    // - Every 5 seconds if not connected (to detect when sessions become active)
    // - Every 30 seconds if connected (to detect if connection dropped and sessions are still active)
    const pollInterval = hasActiveSessions ? 30000 : 5000;
    const interval = setInterval(() => {
      checkForActiveSessions();
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [checkForActiveSessions, hasActiveSessions]);
  
  // Only connect to SSE when sessions actually exist and are starting/active
  const shouldConnectToSessions = useCallback(() => {
    return hasActiveSessions;
  }, [hasActiveSessions]);
  
  const { cards: cardsStatus, facts: factsStatus, isLoading: sessionsLoading, error: sessionsError, reconnect } = useAgentSessions(eventId, shouldConnectToSessions);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<{ cards: boolean; facts: boolean }>({ cards: false, facts: false });
  const [isStartingSessions, setIsStartingSessions] = useState(false);
  const [startSessionsError, setStartSessionsError] = useState<string | null>(null);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [pauseResumeError, setPauseResumeError] = useState<string | null>(null);
  const [isTestTranscriptModalOpen, setIsTestTranscriptModalOpen] = useState(false);

  // Fetch total cost from all generation cycles
  useEffect(() => {
    const fetchTotalCost = async () => {
      setCostLoading(true);
      try {
        const res = await fetch(`/api/context/${eventId}/versions`);
        const data = await res.json();
        
        if (data.ok && data.cycles) {
          // Sum up costs from all cycles
          const total = data.cycles.reduce((sum: number, cycle: any) => {
            const cycleCost = cycle.cost;
            return sum + (cycleCost !== null && cycleCost !== undefined ? parseFloat(cycleCost) : 0);
          }, 0);
          setTotalCost(total);
        }
      } catch (err) {
        console.error('Failed to fetch total cost:', err);
      } finally {
        setCostLoading(false);
      }
    };

    if (eventId) {
      fetchTotalCost();
    }
  }, [eventId]);

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

  const handleCreateSessions = async () => {
    setIsStartingSessions(true);
    setStartSessionsError(null);

    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/create`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to create sessions');
      }

      // Refresh agent info to reflect status change (context_complete -> testing)
      await refetch();
      
      // Check for active sessions (they will be in 'generated' state initially, so we wait)
      // The status will change to 'starting' when user clicks "Start Sessions"
      setTimeout(() => {
        checkForActiveSessions();
      }, 1000);
      
      console.log('[AgentOverview] Sessions created successfully. Agent status set to testing.');
    } catch (err: any) {
      console.error('Failed to create sessions:', err);
      setStartSessionsError(err.message || 'Failed to create sessions');
    } finally {
      setIsStartingSessions(false);
    }
  };

  const handleStartSessions = async () => {
    setIsStartingSessions(true);
    setStartSessionsError(null);

    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/start`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to start sessions');
      }

      // Refresh agent info
      await refetch();
      
      // Check for active sessions (they should now be in 'starting' state)
      setTimeout(() => {
        checkForActiveSessions();
      }, 1000);
      
      // Sessions will be activated by worker
      console.log('[AgentOverview] Sessions will be started by worker...');
    } catch (err: any) {
      console.error('Failed to start sessions:', err);
      setStartSessionsError(err.message || 'Failed to start sessions');
    } finally {
      setIsStartingSessions(false);
    }
  };

  const handleConfirmReady = async () => {
    setIsResuming(true); // Reuse loading state
    setPauseResumeError(null);

    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/confirm-ready`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to confirm ready');
      }

      // Refresh agent info (testing -> ready)
      await refetch();
      
      console.log('[AgentOverview] Agent confirmed ready. Sessions regenerated.');
    } catch (err: any) {
      console.error('Failed to confirm ready:', err);
      setPauseResumeError(err.message || 'Failed to confirm ready');
    } finally {
      setIsResuming(false);
    }
  };

  const handleSendTestTranscript = async (text: string, speaker: string) => {
    const res = await fetch(`/api/agent-sessions/${eventId}/test-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker }),
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'Failed to send test transcript');
    }

    console.log('[AgentOverview] Test transcript sent successfully');
  };

  const handlePauseSessions = async () => {
    setIsPausing(true);
    setPauseResumeError(null);

    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/pause`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to pause sessions');
      }

      // Refresh agent info to reflect status change
      await refetch();
      
      console.log('[AgentOverview] Sessions paused');
    } catch (err: any) {
      console.error('Failed to pause sessions:', err);
      setPauseResumeError(err.message || 'Failed to pause sessions');
    } finally {
      setIsPausing(false);
    }
  };

  const handleResumeSessions = async () => {
    setIsResuming(true);
    setPauseResumeError(null);

    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/resume`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to resume sessions');
      }

      // Refresh agent info to reflect status change
      await refetch();
      
      console.log('[AgentOverview] Sessions will be resumed by worker');
    } catch (err: any) {
      console.error('Failed to resume sessions:', err);
      setPauseResumeError(err.message || 'Failed to resume sessions');
    } finally {
      setIsResuming(false);
    }
  };

  const getSessionStatusColor = (status: string): string => {
    switch (status) {
      case 'generated':
        return '#64748b'; // Gray for generated (not started)
      case 'starting':
        return '#f59e0b';
      case 'active':
        return '#10b981';
      case 'paused':
        return '#8b5cf6'; // Purple for paused
      case 'closed':
        return '#6b7280';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getSessionStatusLabel = (status: string): string => {
    switch (status) {
      case 'generated':
        return 'Generated';
      case 'starting':
        return 'Starting';
      case 'active':
        return 'Active';
      case 'paused':
        return 'Paused';
      case 'closed':
        return 'Closed';
      case 'error':
        return 'Error';
      default:
        return status;
    }
  };

  const SessionStatusCard = ({ title, status }: { title: string; status: AgentSessionStatus | null }) => {
    if (!status) return null;

    const statusColor = getSessionStatusColor(status.status);
    const statusLabel = getSessionStatusLabel(status.status);
    const agentType = status.agent_type;
    const isExpanded = expandedLogs[agentType];

    return (
      <div style={{
        padding: '20px',
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <h5 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}>
            {title}
          </h5>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
            }} />
            <span style={{
              fontSize: '14px',
              fontWeight: '500',
              color: statusColor,
            }}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Session Info */}
        <div style={{
          marginBottom: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#64748b',
            fontFamily: 'monospace',
            marginBottom: '4px',
          }}>
            {status.session_id === 'pending' || status.status === 'generated' ? (
              <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                Pending activation
              </span>
            ) : (
              <>Session: {status.session_id.substring(0, 20)}...</>
            )}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#64748b',
          }}>
            Model: {status.metadata.model || 'N/A'}
          </div>
        </div>

        {/* Token Metrics */}
        {status.token_metrics && (
          <div style={{
            marginBottom: '16px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
            }}>
              Token Metrics
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Total</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                  {status.token_metrics.total_tokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Avg</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                  {status.token_metrics.avg_tokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Max</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                  {status.token_metrics.max_tokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Requests</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                  {status.token_metrics.request_count}
                </div>
              </div>
            </div>
            {(status.token_metrics.warnings > 0 || status.token_metrics.criticals > 0) && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                background: status.token_metrics.criticals > 0 ? '#fef2f2' : '#fffbeb',
                borderRadius: '6px',
                border: `1px solid ${status.token_metrics.criticals > 0 ? '#fecaca' : '#fde68a'}`,
              }}>
                <div style={{
                  fontSize: '12px',
                  color: status.token_metrics.criticals > 0 ? '#dc2626' : '#d97706',
                }}>
                  {status.token_metrics.criticals > 0 && `⚠️ ${status.token_metrics.criticals} critical threshold breaches`}
                  {status.token_metrics.criticals > 0 && status.token_metrics.warnings > 0 && ' • '}
                  {status.token_metrics.warnings > 0 && `⚠️ ${status.token_metrics.warnings} warnings`}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Runtime Stats */}
        {status.runtime && (
          <div style={{
            marginBottom: '16px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
            }}>
              Runtime Stats
            </div>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              lineHeight: '1.6',
            }}>
              <div>Cards Last Seq: {status.runtime.cards_last_seq}</div>
              <div>Facts Last Seq: {status.runtime.facts_last_seq}</div>
              {status.runtime.ring_buffer_stats && (
                <div>Ring Buffer: {status.runtime.ring_buffer_stats.finalized || 0} chunks</div>
              )}
              {status.runtime.facts_store_stats && (
                <div>Facts Store: {status.runtime.facts_store_stats.capacityUsed || 0} items</div>
              )}
            </div>
          </div>
        )}

        {/* Recent Logs */}
        {status.recent_logs && status.recent_logs.length > 0 && (
          <div>
            <button
              onClick={() => setExpandedLogs(prev => ({ ...prev, [agentType]: !prev[agentType] }))}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                color: '#64748b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Recent Logs ({status.recent_logs.length})</span>
              <span>{isExpanded ? '▼' : '▶'}</span>
            </button>
            {isExpanded && (
              <div style={{
                marginTop: '12px',
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '12px',
                background: '#f8fafc',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
              }}>
                {status.recent_logs.slice(-20).reverse().map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px',
                      marginBottom: '8px',
                      background: '#ffffff',
                      borderRadius: '4px',
                      borderLeft: `3px solid ${
                        log.level === 'error' ? '#ef4444' :
                        log.level === 'warn' ? '#f59e0b' : '#3b82f6'
                      }`,
                    }}
                  >
                    <div style={{
                      fontSize: '11px',
                      color: '#64748b',
                      marginBottom: '4px',
                    }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                      {log.context?.seq && ` • Seq ${log.context.seq}`}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {log.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metadata */}
        <div style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #e2e8f0',
          fontSize: '11px',
          color: '#94a3b8',
        }}>
          <div>Created: {formatDate(status.metadata.created_at)}</div>
          <div>Updated: {formatDate(status.metadata.updated_at)}</div>
          {status.metadata.closed_at && (
            <div>Closed: {formatDate(status.metadata.closed_at)}</div>
          )}
        </div>
      </div>
    );
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
            {costLoading ? (
              <span style={{ fontSize: '12px', color: '#64748b' }}>Loading...</span>
            ) : totalCost !== null ? (
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

      {/* Agent Session Status */}
      {/* Always show section when agent exists - will display appropriate message based on status */}
      {agent && (
        <div style={{
          marginBottom: '24px',
          paddingBottom: '24px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <h4 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#0f172a',
              margin: 0,
            }}>
              Realtime Agent Sessions
            </h4>
            
            {/* Controls - Top Right Corner */}
            <div style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}>
              {/* Refresh button - always visible */}
              <button
                onClick={() => reconnect()}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                }}
                title="Refresh session status"
              >
                Refresh
              </button>
              
              {/* Create Sessions button - visible when agent is context_complete AND no sessions exist */}
              {agent?.status === 'context_complete' && 
               !cardsStatus && 
               !factsStatus && 
               !sessionsLoading && (
                <button
                  onClick={handleCreateSessions}
                  disabled={isStartingSessions}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#ffffff',
                    background: isStartingSessions ? '#93c5fd' : '#3b82f6',
                    cursor: isStartingSessions ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isStartingSessions) {
                      e.currentTarget.style.background = '#2563eb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isStartingSessions) {
                      e.currentTarget.style.background = '#3b82f6';
                    }
                  }}
                  title="Create sessions (generates but does not start them)"
                >
                  {isStartingSessions ? 'Creating...' : 'Create Sessions'}
                </button>
              )}
              
              {/* Testing state buttons - visible when agent is testing */}
              {agent?.status === 'testing' && (
                <>
                  {/* Start Sessions button - visible when sessions are generated but not active */}
                  {/* Show button when: both sessions exist and are 'generated', OR at least one exists and is 'generated' (allow for async updates) */}
                  {((cardsStatus?.status === 'generated' && factsStatus?.status === 'generated') ||
                    (cardsStatus?.status === 'generated' && !factsStatus) ||
                    (!cardsStatus && factsStatus?.status === 'generated') ||
                    // Also show if we're in testing state but haven't received status yet (sessions might be loading)
                    (!cardsStatus && !factsStatus && sessionsLoading)) && (
                    <button
                      onClick={handleStartSessions}
                      disabled={isStartingSessions}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#ffffff',
                        background: isStartingSessions ? '#93c5fd' : '#3b82f6',
                        cursor: isStartingSessions ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isStartingSessions) {
                          e.currentTarget.style.background = '#2563eb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isStartingSessions) {
                          e.currentTarget.style.background = '#3b82f6';
                        }
                      }}
                      title="Start generated sessions"
                    >
                      {isStartingSessions ? 'Starting...' : 'Start Sessions'}
                    </button>
                  )}
                  
                  {/* Pause Sessions button - visible when sessions are active */}
                  {(cardsStatus?.status === 'active' || factsStatus?.status === 'active') && (
                    <button
                      onClick={handlePauseSessions}
                      disabled={isPausing}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: isPausing ? '#9ca3af' : '#374151',
                        background: isPausing ? '#f3f4f6' : '#ffffff',
                        cursor: isPausing ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isPausing) {
                          e.currentTarget.style.background = '#f8fafc';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isPausing) {
                          e.currentTarget.style.background = '#ffffff';
                        }
                      }}
                      title="Pause active sessions (preserves state for resume)"
                    >
                      {isPausing ? 'Pausing...' : 'Pause Sessions'}
                    </button>
                  )}
                  
                  {/* Test Transcript button - always visible in testing state */}
                  <button
                    onClick={() => setIsTestTranscriptModalOpen(true)}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                    }}
                    title="Send test transcript to sessions"
                  >
                    Test Transcript
                  </button>
                  
                  {/* Confirm Ready button - always visible in testing state */}
                  <button
                    onClick={handleConfirmReady}
                    disabled={isResuming}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: isResuming ? '#9ca3af' : '#374151',
                      background: isResuming ? '#f3f4f6' : '#ffffff',
                      cursor: isResuming ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isResuming) {
                        e.currentTarget.style.background = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isResuming) {
                        e.currentTarget.style.background = '#ffffff';
                      }
                    }}
                    title="Stop sessions, regenerate, and set agent to ready"
                  >
                    {isResuming ? 'Processing...' : 'Confirm Ready'}
                  </button>
                </>
              )}
            </div>
          </div>
          
          {(pauseResumeError || startSessionsError) && (
            <div style={{
              padding: '8px 12px',
              marginBottom: '16px',
              background: '#fef2f2',
              borderRadius: '6px',
              border: '1px solid #fecaca',
              fontSize: '12px',
              color: '#dc2626',
            }}>
              {pauseResumeError || startSessionsError}
            </div>
          )}
          
          {sessionsError && (
            <div style={{
              padding: '12px',
              background: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              marginBottom: '16px',
            }}>
              <div style={{
                fontSize: '12px',
                color: '#dc2626',
              }}>
                Error connecting to session stream: {sessionsError.message}
              </div>
            </div>
          )}

          {sessionsLoading && !cardsStatus && !factsStatus && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
            }}>
              Loading session status...
            </div>
          )}

          {!sessionsLoading && !cardsStatus && !factsStatus && !sessionsError && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                fontSize: '14px',
                color: '#64748b',
                marginBottom: '8px',
              }}>
                No active agent sessions
              </div>
              <div style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '16px',
              }}>
                {agent?.status === 'ready' || agent?.status === 'context_complete'
                  ? 'Use the "Create Sessions" button above to begin.'
                  : agent?.status === 'running'
                  ? 'Waiting for sessions to be created...'
                  : 'Agent sessions are only available when the event is running.'}
              </div>
            </div>
          )}

          {(cardsStatus || factsStatus) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '16px',
            }}>
              {/* Cards Agent Session */}
              {cardsStatus && (
                <SessionStatusCard
                  key={`cards-${cardsStatus.session_id}-${cardsStatus.status}-${cardsStatus.metadata?.updated_at || Date.now()}`}
                  title="Cards Agent"
                  status={cardsStatus}
                />
              )}
              
              {/* Facts Agent Session */}
              {factsStatus && (
                <SessionStatusCard
                  key={`facts-${factsStatus.session_id}-${factsStatus.status}-${factsStatus.metadata?.updated_at || Date.now()}`}
                  title="Facts Agent"
                  status={factsStatus}
                />
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Test Transcript Modal */}
      <TestTranscriptModal
        eventId={eventId}
        isOpen={isTestTranscriptModalOpen}
        onClose={() => setIsTestTranscriptModalOpen(false)}
        onSend={handleSendTestTranscript}
      />
    </div>
  );
}

