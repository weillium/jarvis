'use client';

import { useState, useEffect } from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
import { useAgentSessionEnrichment, AgentSessionSSEEnrichment } from '@/shared/hooks/use-agent-sessions';
import type { TokenMetrics, RuntimeStats } from '@/shared/hooks/use-agent-sessions-query';
import { useAgentSessionsQuery } from '@/shared/hooks/use-agent-sessions-query';
import {
  useCreateSessionsMutation,
  useStartSessionsMutation,
  usePauseSessionsMutation,
  useResumeSessionsMutation,
  useConfirmReadyMutation,
  useSendTestTranscriptMutation,
} from '@/shared/hooks/use-mutations';
import { TestTranscriptModal } from './test-transcript-modal';

interface AgentOverviewProps {
  eventId: string;
}

type GenerationCycle = {
  cost: number | null;
  [key: string]: unknown;
};

// Helper functions
const getSessionStatusColor = (status: string): string => {
  switch (status) {
    case 'active':
      return '#10b981';
    case 'paused':
      return '#8b5cf6';
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

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
};

// SessionStatusCard component - moved outside to fix hooks issue
interface AgentSessionDisplay {
  agent_type: 'cards' | 'facts';
  session_id: string;
  status: 'active' | 'paused' | 'closed' | 'error';
  metadata: {
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    model?: string;
  };
  token_metrics?: {
    total_tokens: number;
    request_count: number;
    max_tokens: number;
    avg_tokens: number;
    warnings: number;
    criticals: number;
    last_request?: {
      tokens: number;
      percentage: number;
      breakdown: Record<string, number>;
      timestamp: string;
    };
  };
  runtime_stats?: {
    cards_last_seq: number;
    facts_last_seq: number;
    facts_last_update: string;
    ring_buffer_stats: {
      total: number;
      finalized: number;
      oldest: number | null;
      newest: number | null;
    };
    facts_store_stats: {
      total: number;
      maxItems: number;
      capacityUsed: string;
      highConfidence: number;
      mediumConfidence: number;
      lowConfidence: number;
      evictions: number;
    };
  };
  metrics_recorded_at?: string;
  websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  ping_pong?: {
    enabled: boolean;
    missedPongs: number;
    lastPongReceived?: string;
    pingIntervalMs: number;
    pongTimeoutMs: number;
    maxMissedPongs: number;
  };
  recent_logs?: Array<{
    level: 'log' | 'warn' | 'error';
    message: string;
    timestamp: string;
    context?: {
      seq?: number;
      agent_type?: 'cards' | 'facts';
      event_id?: string;
    };
  }>;
}

interface SessionStatusCardProps {
  title: string;
  session: AgentSessionDisplay;
  expandedLogs: { cards: boolean; facts: boolean };
  setExpandedLogs: React.Dispatch<React.SetStateAction<{ cards: boolean; facts: boolean }>>;
}

function SessionStatusCard({ title, session, expandedLogs, setExpandedLogs }: SessionStatusCardProps) {
  // Real-time runtime calculation with state to trigger updates - hooks must be before early return
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Determine WebSocket connection status - calculate before early return
  const actualWebSocketState = session.websocket_state;
  const isWebSocketLive = actualWebSocketState === 'OPEN' || (actualWebSocketState === undefined && session.status === 'active');
  
  useEffect(() => {
    if (!isWebSocketLive || !session.metadata.created_at) return;
    
    // Update every second when session is active
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWebSocketLive]);

  const statusColor = getSessionStatusColor(session.status);
  const statusLabel = getSessionStatusLabel(session.status);
  const agentType = session.agent_type;
  const isExpanded = expandedLogs[agentType];
  
  // Determine connection status label
  let connectionStatus: string;
  let connectionColor: string;
  
  if (actualWebSocketState) {
    // Use actual WebSocket readyState (from SSE)
    switch (actualWebSocketState) {
      case 'OPEN':
        connectionStatus = 'Live';
        connectionColor = '#10b981';
        break;
      case 'CONNECTING':
        connectionStatus = 'Connecting';
        connectionColor = '#f59e0b';
        break;
      case 'CLOSING':
        connectionStatus = 'Closing';
        connectionColor = '#f59e0b';
        break;
      case 'CLOSED':
        connectionStatus = 'Disconnected';
        connectionColor = '#6b7280';
        break;
      default:
        connectionStatus = session.status === 'paused' ? 'Paused' : 'Disconnected';
        connectionColor = session.status === 'paused' ? '#8b5cf6' : '#6b7280';
    }
  } else {
    // Fall back to database status
    // Check if closed session is new (created in last minute)
    const isNewClosed = session.status === 'closed' && session.metadata?.created_at && 
      (new Date().getTime() - new Date(session.metadata.created_at).getTime()) < 60000;
    connectionStatus = session.status === 'active' ? 'Live' : session.status === 'paused' ? 'Paused' : isNewClosed ? 'Ready' : 'Disconnected';
    connectionColor = session.status === 'active' ? '#10b981' : session.status === 'paused' ? '#8b5cf6' : isNewClosed ? '#64748b' : '#6b7280';
  }

  // Calculate runtime (how long session has been running)
  const calculateRuntime = () => {
    if (!session.metadata.created_at) return null;
    
    const created = new Date(session.metadata.created_at);
    const now = currentTime;
    const diffMs = now.getTime() - created.getTime();
    
    if (diffMs < 0) return null; // Invalid date
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const runtime = calculateRuntime();

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

      {/* Connection Status & Runtime */}
      <div style={{
        marginBottom: '16px',
        paddingBottom: '16px',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connectionColor,
            animation: isWebSocketLive ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
          }} />
          <span style={{
            fontSize: '12px',
            fontWeight: '600',
            color: connectionColor,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            WebSocket: {connectionStatus}
            {actualWebSocketState && (
              <span style={{
                fontSize: '10px',
                fontWeight: '400',
                marginLeft: '6px',
                opacity: 0.7,
                textTransform: 'none',
              }}>
                ({actualWebSocketState})
              </span>
            )}
          </span>
        </div>
        
        {/* Ping-Pong Health Status */}
        {session.websocket_state && session.websocket_state === 'OPEN' && (
          <div style={{
            marginBottom: '8px',
            padding: '8px 12px',
            background: session.ping_pong?.missedPongs === 0 ? '#f0fdf4' : session.ping_pong?.missedPongs === 1 ? '#fffbeb' : '#fef2f2',
            borderRadius: '6px',
            border: `1px solid ${session.ping_pong?.missedPongs === 0 ? '#bbf7d0' : session.ping_pong?.missedPongs === 1 ? '#fde68a' : '#fecaca'}`,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px',
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                color: session.ping_pong?.missedPongs === 0 ? '#166534' : session.ping_pong?.missedPongs === 1 ? '#92400e' : '#991b1b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Connection Health
              </span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {session.ping_pong?.missedPongs === 0 && (
                  <span style={{ fontSize: '12px' }}>✓ Healthy</span>
                )}
                {session.ping_pong?.missedPongs === 1 && (
                  <span style={{ fontSize: '12px', color: '#d97706' }}>⚠ 1 Missed</span>
                )}
                {session.ping_pong && session.ping_pong.missedPongs >= 2 && (
                  <span style={{ fontSize: '12px', color: '#dc2626' }}>⚠⚠ {session.ping_pong.missedPongs} Missed</span>
                )}
              </div>
            </div>
            {session.ping_pong?.enabled && (
              <div style={{
                fontSize: '10px',
                color: '#64748b',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                {session.ping_pong.lastPongReceived && (
                  <span>
                    Last pong: {new Date(session.ping_pong.lastPongReceived).toLocaleTimeString()}
                  </span>
                )}
                <span>
                  Ping interval: {Math.round((session.ping_pong.pingIntervalMs || 0) / 1000)}s
                </span>
                {session.ping_pong.missedPongs > 0 && (
                  <span style={{ color: '#dc2626', fontWeight: '600' }}>
                    {session.ping_pong.missedPongs}/{session.ping_pong.maxMissedPongs} missed
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        
        {runtime && (
          <div style={{
            fontSize: '12px',
            color: '#64748b',
            marginBottom: '4px',
          }}>
            Runtime: {runtime}
          </div>
        )}
        <div style={{
          fontSize: '12px',
          color: '#64748b',
          fontFamily: 'monospace',
          marginBottom: '4px',
        }}>
          {session.session_id === 'pending' || (session.status === 'closed' && session.metadata?.created_at && 
            (new Date().getTime() - new Date(session.metadata.created_at).getTime()) < 60000) ? (
              <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                Pending activation
              </span>
          ) : (
            <>Session: {session.session_id.substring(0, 20)}...</>
          )}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#64748b',
        }}>
          Model: {session.metadata.model || 'N/A'}
        </div>
        {session.metrics_recorded_at && (
          <div style={{
            fontSize: '11px',
            color: '#94a3b8',
            fontStyle: 'italic',
          }}>
            Metrics recorded at: {new Date(session.metrics_recorded_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* Token Metrics */}
      {session.token_metrics && (
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
                {session.token_metrics.total_tokens.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Avg</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                {session.token_metrics.avg_tokens.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Max</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                {session.token_metrics.max_tokens.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Requests</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                {session.token_metrics.request_count}
              </div>
            </div>
          </div>
          {(session.token_metrics.warnings > 0 || session.token_metrics.criticals > 0) && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: session.token_metrics.criticals > 0 ? '#fef2f2' : '#fffbeb',
              borderRadius: '6px',
              border: `1px solid ${session.token_metrics.criticals > 0 ? '#fecaca' : '#fde68a'}`,
            }}>
              <div style={{
                fontSize: '12px',
                color: session.token_metrics.criticals > 0 ? '#dc2626' : '#d97706',
              }}>
                {session.token_metrics.criticals > 0 && `⚠️ ${session.token_metrics.criticals} critical threshold breaches`}
                {session.token_metrics.criticals > 0 && session.token_metrics.warnings > 0 && ' • '}
                {session.token_metrics.warnings > 0 && `⚠️ ${session.token_metrics.warnings} warnings`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Runtime Stats */}
      {session.runtime_stats && (
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
            <div>Cards Last Seq: {session.runtime_stats.cards_last_seq}</div>
            <div>Facts Last Seq: {session.runtime_stats.facts_last_seq}</div>
            {session.runtime_stats.ring_buffer_stats && (
              <div>Ring Buffer: {session.runtime_stats.ring_buffer_stats.finalized || 0} chunks</div>
            )}
            {session.runtime_stats.facts_store_stats && (
              <div>Facts Store: {session.runtime_stats.facts_store_stats.capacityUsed || 'N/A'} items</div>
            )}
          </div>
        </div>
      )}

      {/* Recent Logs */}
      {session.recent_logs && session.recent_logs.length > 0 && (
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
            <span>Recent Logs ({session.recent_logs.length})</span>
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
              {session.recent_logs.slice(-20).reverse().map((log, idx) => (
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
        <div>Created: {formatDate(session.metadata.created_at)}</div>
        <div>Updated: {formatDate(session.metadata.updated_at)}</div>
        {session.metadata.closed_at && (
          <div>Closed: {formatDate(session.metadata.closed_at)}</div>
        )}
      </div>
    </div>
  );
}

export function AgentOverview({ eventId }: AgentOverviewProps) {
  const { data: agentData, isLoading, error } = useAgentQuery(eventId);
  const { data: cycles } = useContextVersionsQuery(eventId);
  const { data: sessionsData, isLoading: sessionsQueryLoading, refetch: refetchSessions } = useAgentSessionsQuery(eventId);
  
  const agent = agentData?.agent;
  const contextStats = agentData?.contextStats;
  const blueprint = agentData?.blueprint;
  
  // Derive state from React Query sessions data
  const checkingSessions = sessionsQueryLoading;
  
  // Get session agent types that exist (for SSE connection)
  const existingAgentTypes = sessionsData?.sessions.map(s => s.agent_type) || [];
  
  // SSE - only for enrichment (connection health, real-time metrics)
  const { enrichment, isLoading: enrichmentLoading, error: enrichmentError, reconnect } = useAgentSessionEnrichment(
    eventId,
    existingAgentTypes
  );
  
  // Combine DB state with SSE enrichment
  interface AgentSessionDisplay {
    agent_type: 'cards' | 'facts';
    session_id: string;
    status: 'active' | 'paused' | 'closed' | 'error';
    metadata: {
      created_at: string;
      updated_at: string;
      closed_at: string | null;
      model?: string;
    };
    token_metrics?: TokenMetrics;
    runtime_stats?: RuntimeStats;
    metrics_recorded_at?: string;
    websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
    ping_pong?: AgentSessionSSEEnrichment['ping_pong'];
    recent_logs?: AgentSessionSSEEnrichment['recent_logs'];
  }
  
  // Merge DB state with SSE enrichment
  const displaySessions: AgentSessionDisplay[] = (sessionsData?.sessions || []).map(dbSession => {
    const sseData = enrichment.get(dbSession.agent_type);
    
    // For metrics: use DB if available (session closed), otherwise use SSE (session active)
    const tokenMetrics = dbSession.token_metrics || sseData?.token_metrics;
    const runtimeStats = dbSession.runtime_stats || sseData?.runtime_stats;
    
    return {
      ...dbSession, // DB fields (status, metadata, session_id)
      token_metrics: tokenMetrics,
      runtime_stats: runtimeStats,
      metrics_recorded_at: dbSession.metrics_recorded_at, // DB only
      // SSE enrichment
      websocket_state: sseData?.websocket_state,
      ping_pong: sseData?.ping_pong,
      recent_logs: sseData?.recent_logs,
    };
  });
  
  const [expandedLogs, setExpandedLogs] = useState<{ cards: boolean; facts: boolean }>({ cards: false, facts: false });
  const [isTestTranscriptModalOpen, setIsTestTranscriptModalOpen] = useState(false);

  // Mutation hooks
  const createSessionsMutation = useCreateSessionsMutation(eventId);
  const startSessionsMutation = useStartSessionsMutation(eventId);
  const pauseSessionsMutation = usePauseSessionsMutation(eventId);
  const resumeSessionsMutation = useResumeSessionsMutation(eventId);
  const confirmReadyMutation = useConfirmReadyMutation(eventId);
  const sendTestTranscriptMutation = useSendTestTranscriptMutation(eventId);

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const handleCreateSessions = () => {
    createSessionsMutation.mutate(undefined, {
      onSuccess: async () => {
        // Immediately refetch sessions (they will be in 'closed' state)
        // This will display them immediately, but SSE won't connect until they advance to active
        await refetchSessions();
        console.log('[AgentOverview] Sessions created successfully. Agent status set to testing.');
      },
    });
  };

  const handleStartSessions = () => {
    startSessionsMutation.mutate(undefined, {
      onSuccess: () => {
        // Check for sessions - they should now be in 'active' state
        // This will trigger SSE connection since they're now active
        setTimeout(() => {
          refetchSessions();
        }, 1000);
        console.log('[AgentOverview] Sessions will be started by worker...');
      },
    });
  };

  const handleConfirmReady = () => {
    confirmReadyMutation.mutate(undefined, {
      onSuccess: () => {
        console.log('[AgentOverview] Agent confirmed ready. Sessions regenerated.');
      },
    });
  };

  const handleSendTestTranscript = (text: string, speaker: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      sendTestTranscriptMutation.mutate({ text, speaker }, {
        onSuccess: () => {
          console.log('[AgentOverview] Test transcript sent successfully');
          resolve();
        },
        onError: (err) => {
          reject(err);
        },
      });
    });
  };

  const handlePauseSessions = () => {
    pauseSessionsMutation.mutate(undefined, {
      onSuccess: async () => {
        // Refetch sessions to get updated status (SSE will disconnect since sessions are now paused)
        await refetchSessions();
        console.log('[AgentOverview] Sessions paused');
      },
    });
  };

  // Get mutation states
  const isStartingSessions = createSessionsMutation.isPending || startSessionsMutation.isPending;
  const startSessionsError = createSessionsMutation.error || startSessionsMutation.error
    ? (createSessionsMutation.error instanceof Error ? createSessionsMutation.error.message : startSessionsMutation.error instanceof Error ? startSessionsMutation.error.message : 'Failed to start sessions')
    : null;
  const isPausing = pauseSessionsMutation.isPending;
  const isResuming = resumeSessionsMutation.isPending || confirmReadyMutation.isPending;
  const pauseResumeError = pauseSessionsMutation.error || resumeSessionsMutation.error || confirmReadyMutation.error
    ? (pauseSessionsMutation.error instanceof Error ? pauseSessionsMutation.error.message : resumeSessionsMutation.error instanceof Error ? resumeSessionsMutation.error.message : confirmReadyMutation.error instanceof Error ? confirmReadyMutation.error.message : 'Failed to perform operation')
    : null;


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
                onClick={() => {
                  // Refresh session check first, then reconnect SSE if needed
                  refetchSessions();
                  reconnect();
                }}
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
              
              {/* Create Sessions button - visible when agent is context_complete AND no sessions exist in database */}
              {/* Only depends on database state, not SSE visualization state */}
              {agent?.status === 'idle' && agent?.stage === 'context_complete' && 
               !checkingSessions && 
               sessionsData && 
               !sessionsData.hasSessions && (
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
              
              {/* Start/Resume Sessions button - visible when sessions are new (closed) or paused */}
              {/* Show button based on database session status, not SSE visualization status */}
              {(() => {
                // Only show button if we have database data (not still loading)
                if (checkingSessions || !sessionsData) {
                  return false;
                }
                
                // Check database session status (from displaySessions - DB source)
                const cardsSession = displaySessions.find(s => s.agent_type === 'cards');
                const factsSession = displaySessions.find(s => s.agent_type === 'facts');
                
                // Helper to check if session is newly closed (created in last minute)
                const isNewClosed = (session: typeof cardsSession) => 
                  session?.status === 'closed' && session?.metadata?.created_at && 
                  (new Date().getTime() - new Date(session.metadata.created_at).getTime()) < 60000;
                
                // Check if sessions are paused
                const isPaused = (cardsSession?.status === 'paused') || (factsSession?.status === 'paused');
                
                // Show if sessions are paused (resume) or newly closed (start)
                return isPaused || isNewClosed(cardsSession) || isNewClosed(factsSession);
              })() && (() => {
                // Get session status from database for button labels
                const cardsSession = displaySessions.find(s => s.agent_type === 'cards');
                const factsSession = displaySessions.find(s => s.agent_type === 'facts');
                const isPaused = (cardsSession?.status === 'paused') || (factsSession?.status === 'paused');
                
                return (
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
                      title={isPaused 
                        ? 'Resume paused sessions' 
                        : 'Start sessions'}
                    >
                      {isStartingSessions 
                        ? (isPaused 
                            ? 'Resuming...' 
                            : 'Starting...')
                        : (isPaused 
                            ? 'Resume Sessions' 
                            : 'Start Sessions')}
                    </button>
                );
              })()}
              
              {/* Pause Sessions button - visible when sessions are active (based on database state) */}
              {(() => {
                // Check database session status, not SSE visualization
                if (checkingSessions || !sessionsData) {
                  return false;
                }
                const cardsSession = displaySessions.find(s => s.agent_type === 'cards');
                const factsSession = displaySessions.find(s => s.agent_type === 'facts');
                return (cardsSession?.status === 'active' || factsSession?.status === 'active');
              })() && (
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
              
              {/* Testing state buttons - visible when agent is testing */}
              {agent?.status === 'active' && agent?.stage === 'testing' && (
                <>
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
          
          {enrichmentError && (
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
                Error connecting to enrichment stream: {enrichmentError.message}
              </div>
            </div>
          )}

          {(enrichmentLoading || checkingSessions) && displaySessions.length === 0 && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
            }}>
              Loading session status...
            </div>
          )}

          {!enrichmentLoading && !checkingSessions && displaySessions.length === 0 && !enrichmentError && (
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
                {(agent?.status === 'idle' && (agent?.stage === 'ready' || agent?.stage === 'context_complete'))
                  ? 'Use the "Create Sessions" button above to begin.'
                  : (agent?.status === 'active' && agent?.stage === 'running')
                  ? 'Waiting for sessions to be created...'
                  : 'Agent sessions are only available when the event is running.'}
              </div>
            </div>
          )}

          {displaySessions.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '16px',
            }}>
              {displaySessions.map(session => (
                <SessionStatusCard
                  key={`${session.agent_type}-${session.session_id}-${session.status}`}
                  title={session.agent_type === 'cards' ? 'Cards Agent' : 'Facts Agent'}
                  session={session}
                  expandedLogs={expandedLogs}
                  setExpandedLogs={setExpandedLogs}
                />
              ))}
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

