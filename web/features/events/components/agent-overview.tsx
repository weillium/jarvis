'use client';

import { useState, useEffect } from 'react';
import { useAgentInfo } from '@/shared/hooks/useAgentInfo';
import { useAgentSessions, AgentSessionStatus } from '@/shared/hooks/use-agent-sessions';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';

interface AgentOverviewProps {
  eventId: string;
}

export function AgentOverview({ eventId }: AgentOverviewProps) {
  const { agent, contextStats, blueprint, loading, error, refetch } = useAgentInfo(eventId);
  const { cards: cardsStatus, facts: factsStatus, isLoading: sessionsLoading, error: sessionsError } = useAgentSessions(eventId);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<{ cards: boolean; facts: boolean }>({ cards: false, facts: false });
  const [isStartingSessions, setIsStartingSessions] = useState(false);
  const [startSessionsError, setStartSessionsError] = useState<string | null>(null);

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

      // Refresh agent info to reflect status change
      await refetch();
      
      // Sessions will appear once the worker picks up the event (usually within 5-10 seconds)
      // The SSE stream will update automatically via useAgentSessions hook
      console.log('[AgentOverview] Event marked as live, waiting for worker to start sessions...');
    } catch (err: any) {
      console.error('Failed to start sessions:', err);
      setStartSessionsError(err.message || 'Failed to start sessions');
    } finally {
      setIsStartingSessions(false);
    }
  };

  const getSessionStatusColor = (status: string): string => {
    switch (status) {
      case 'starting':
        return '#f59e0b';
      case 'active':
        return '#10b981';
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
      case 'starting':
        return 'Starting';
      case 'active':
        return 'Active';
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
            Session: {status.session_id.substring(0, 20)}...
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
          <h4 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 16px 0',
          }}>
            Realtime Agent Sessions
          </h4>
          
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
                  ? 'Sessions will be created when the event is marked as live.'
                  : agent?.status === 'running'
                  ? 'Waiting for sessions to be created...'
                  : 'Agent sessions are only available when the event is running.'}
              </div>
              
              {/* Manual Start Button for Testing */}
              {(agent?.status === 'ready' || agent?.status === 'context_complete') && (
                <div>
                  {startSessionsError && (
                    <div style={{
                      padding: '8px 12px',
                      marginBottom: '12px',
                      background: '#fef2f2',
                      borderRadius: '6px',
                      border: '1px solid #fecaca',
                      fontSize: '12px',
                      color: '#dc2626',
                    }}>
                      {startSessionsError}
                    </div>
                  )}
                  <button
                    onClick={handleStartSessions}
                    disabled={isStartingSessions}
                    style={{
                      padding: '10px 20px',
                      background: isStartingSessions ? '#cbd5e1' : '#3b82f6',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: isStartingSessions ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s',
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
                  >
                    {isStartingSessions ? 'Starting Sessions...' : '🚀 Start Sessions (Testing)'}
                  </button>
                  <div style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    marginTop: '8px',
                    fontStyle: 'italic',
                  }}>
                    Manual trigger for testing - marks event as live
                  </div>
                </div>
              )}
            </div>
          )}

          {(cardsStatus || factsStatus) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '16px',
            }}>
              {/* Cards Agent Session */}
              <SessionStatusCard
                title="Cards Agent"
                status={cardsStatus}
              />
              
              {/* Facts Agent Session */}
              <SessionStatusCard
                title="Facts Agent"
                status={factsStatus}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

