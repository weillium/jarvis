'use client';

import React, { useState } from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useAgentSessionEnrichment, AgentSessionSSEEnrichment } from '@/shared/hooks/use-agent-sessions';
import type { TokenMetrics, RuntimeStats } from '@/shared/hooks/use-agent-sessions-query';
import { useAgentSessionsQuery } from '@/shared/hooks/use-agent-sessions-query';
import {
  useCreateSessionsMutation,
  useStartSessionsMutation,
  usePauseSessionsMutation,
  useConfirmReadyMutation,
  useSendTestTranscriptMutation,
  useResetSessionsMutation,
} from '@/shared/hooks/use-mutations';
import { TestTranscriptModal } from './test-transcript-modal';

interface AgentSessionsProps {
  eventId: string;
}

interface AgentSessionDisplay {
  agent_type: 'transcript' | 'cards' | 'facts';
  transport: 'realtime' | 'stateless';
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

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

// SessionStatusCard component
type AgentType = AgentSessionDisplay['agent_type'];

const agentTitles: Record<AgentType, string> = {
  transcript: 'Transcript Agent',
  cards: 'Cards Agent',
  facts: 'Facts Agent',
};

interface SessionStatusCardProps {
  title: string;
  session: AgentSessionDisplay;
  expandedLogs: Record<AgentType, boolean>;
  setExpandedLogs: React.Dispatch<React.SetStateAction<Record<AgentType, boolean>>>;
}

function SessionStatusCard({ title, session, expandedLogs, setExpandedLogs }: SessionStatusCardProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const actualWebSocketState = session.websocket_state;
  const isWebSocketLive = actualWebSocketState === 'OPEN';

  const shouldTick = isWebSocketLive && !session.runtime_stats?.uptime_ms;

  React.useEffect(() => {
    if (!shouldTick || !session.metadata.created_at) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [shouldTick, session.metadata.created_at]);

  const statusColor = getSessionStatusColor(session.status);
  const statusLabel = getSessionStatusLabel(session.status);
  const agentType = session.agent_type;
  const isExpanded = expandedLogs[agentType];
  const isRealtime = session.transport === 'realtime';
  const runtimeLabel = 'Runtime';
  
  let connectionStatus: string;
  let connectionColor: string;
  
  if (actualWebSocketState) {
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
    const isNewClosed = session.status === 'closed' && session.metadata?.created_at && 
      (new Date().getTime() - new Date(session.metadata.created_at).getTime()) < 60000;
    if (session.status === 'active') {
      connectionStatus = 'Awaiting SSE';
      connectionColor = '#f59e0b';
    } else if (session.status === 'paused') {
      connectionStatus = 'Paused';
      connectionColor = '#8b5cf6';
    } else if (isNewClosed) {
      connectionStatus = 'Ready';
      connectionColor = '#64748b';
    } else {
      connectionStatus = 'Disconnected';
      connectionColor = '#6b7280';
    }
  }

  const metricsRecordedAtMs = session.metrics_recorded_at ? new Date(session.metrics_recorded_at).getTime() : null;
  const baseUptimeMs = session.runtime_stats?.uptime_ms;
  const runtimeMs = (() => {
    if (typeof baseUptimeMs === 'number') {
      if (!metricsRecordedAtMs || !isWebSocketLive || session.status !== 'active') {
        return baseUptimeMs;
      }
      const elapsedSinceMetrics = Date.now() - metricsRecordedAtMs;
      return baseUptimeMs + Math.max(elapsedSinceMetrics, 0);
    }
    if (!session.metadata.created_at) {
      return null;
    }
    const createdAtMs = new Date(session.metadata.created_at).getTime();
    const endTimestampMs = (() => {
      if (session.status === 'active') {
        return currentTime;
      }
      if (session.metadata.closed_at) {
        return new Date(session.metadata.closed_at).getTime();
      }
      if (session.metadata.updated_at) {
        return new Date(session.metadata.updated_at).getTime();
      }
      return currentTime;
    })();

    const diffMs = endTimestampMs - createdAtMs;
    return diffMs >= 0 ? diffMs : null;
  })();

  const runtime = runtimeMs !== null && runtimeMs !== undefined ? formatDuration(runtimeMs) : null;

  return (
    <div style={{
      padding: '20px',
      background: '#ffffff',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h5
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}
        >
          {title}
        </h5>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColor,
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: statusColor,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Connection Status & Runtime */}
      <div
        style={{
          marginBottom: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        {isRealtime && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: connectionColor,
                  animation: isWebSocketLive ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: connectionColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                WebSocket: {connectionStatus}
                {actualWebSocketState && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: '400',
                      marginLeft: '6px',
                      opacity: 0.7,
                      textTransform: 'none',
                    }}
                  >
                    ({actualWebSocketState})
                  </span>
                )}
              </span>
            </div>

            {actualWebSocketState === 'OPEN' && (
              <div
                style={{
                  marginBottom: '8px',
                  padding: '8px 12px',
                  background:
                    session.ping_pong?.missedPongs === 0
                      ? '#f0fdf4'
                      : session.ping_pong?.missedPongs === 1
                      ? '#fffbeb'
                      : '#fef2f2',
                  borderRadius: '6px',
                  border: `1px solid ${
                    session.ping_pong?.missedPongs === 0
                      ? '#bbf7d0'
                      : session.ping_pong?.missedPongs === 1
                      ? '#fde68a'
                      : '#fecaca'
                  }`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color:
                        session.ping_pong?.missedPongs === 0
                          ? '#166534'
                          : session.ping_pong?.missedPongs === 1
                          ? '#92400e'
                          : '#991b1b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Connection Health
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {session.ping_pong?.missedPongs === 0 && (
                      <span style={{ fontSize: '12px' }}>✓ Healthy</span>
                    )}
                    {session.ping_pong?.missedPongs === 1 && (
                      <span style={{ fontSize: '12px', color: '#d97706' }}>⚠ 1 Missed</span>
                    )}
                    {session.ping_pong && session.ping_pong.missedPongs >= 2 && (
                      <span style={{ fontSize: '12px', color: '#dc2626' }}>
                        ⚠⚠ {session.ping_pong.missedPongs} Missed
                      </span>
                    )}
                  </div>
                </div>
                {session.ping_pong?.enabled && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#64748b',
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {session.ping_pong.lastPongReceived && (
                      <span>
                        Last pong: {new Date(session.ping_pong.lastPongReceived).toLocaleTimeString()}
                      </span>
                    )}
                    <span>Ping interval: {Math.round((session.ping_pong.pingIntervalMs || 0) / 1000)}s</span>
                    {session.ping_pong.missedPongs > 0 && (
                      <span style={{ color: '#dc2626', fontWeight: '600' }}>
                        {session.ping_pong.missedPongs}/{session.ping_pong.maxMissedPongs} missed
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div
          style={{
            fontSize: '12px',
            color: '#64748b',
            marginBottom: '4px',
          }}
        >
          {runtime ? `${runtimeLabel}: ${runtime}` : `${runtimeLabel}: N/A`}
        </div>
        {isRealtime && (
          <div
            style={{
              fontSize: '12px',
              color: '#64748b',
              fontFamily: 'monospace',
              marginBottom: '4px',
            }}
          >
            {session.session_id === 'pending' ||
            (session.status === 'closed' &&
              session.metadata?.created_at &&
              new Date().getTime() - new Date(session.metadata.created_at).getTime() < 60000) ? (
              <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>Pending activation</span>
            ) : (
              <>Session: {session.session_id.substring(0, 20)}...</>
            )}
          </div>
        )}
        <div
          style={{
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          Model: {session.metadata.model || 'N/A'}
        </div>
        {session.metrics_recorded_at && (
          <div
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              fontStyle: 'italic',
            }}
          >
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

      {/* Recent Logs */}
      {session.recent_logs && session.recent_logs.length > 0 && (
        <div>
          <button
            onClick={() => setExpandedLogs(prev => ({ ...prev, [session.agent_type]: !prev[session.agent_type] }))}
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
            <span>{expandedLogs[session.agent_type] ? '▼' : '▶'}</span>
          </button>
          {expandedLogs[session.agent_type] && (
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

interface StartSessionsModalProps {
  isOpen: boolean;
  selection: { transcript: boolean; cards: boolean; facts: boolean };
  onSelectionChange: (next: { transcript: boolean; cards: boolean; facts: boolean }) => void;
  onConfirm: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

function StartSessionsModal({
  isOpen,
  selection,
  onSelectionChange,
  onConfirm,
  onClose,
  isSubmitting,
}: StartSessionsModalProps) {
  if (!isOpen) {
    return null;
  }

  const options: Array<{
    key: 'transcript' | 'cards' | 'facts';
    label: string;
    description: string;
  }> = [
    {
      key: 'transcript',
      label: 'Transcript Agent',
      description: 'Captures live audio and produces the transcript stream.',
    },
    {
      key: 'cards',
      label: 'Cards Agent',
      description: 'Generates realtime cards and summaries from transcript context.',
    },
    {
      key: 'facts',
      label: 'Facts Agent',
      description: 'Maintains the structured facts store for downstream consumption.',
    },
  ];

  const hasSelection = selection.transcript || selection.cards || selection.facts;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 'min(440px, 92%)',
          background: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.25)',
          padding: '24px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px', color: '#0f172a' }}>
          Start Agent Sessions
        </h2>
        <p style={{ color: '#475569', marginBottom: '20px', fontSize: '14px', lineHeight: 1.5 }}>
          Choose which realtime agents to spin up for this event. All agents are selected by default.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {options.map(({ key, label, description }) => {
            const checked = selection[key];
            return (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${checked ? '#3b82f6' : '#e2e8f0'}`,
                  background: checked ? 'rgba(59, 130, 246, 0.08)' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onSelectionChange({
                      ...selection,
                      [key]: !checked,
                    })
                  }
                  style={{ marginTop: '4px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>{label}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{description}</div>
                </div>
              </label>
            );
          })}
        </div>

        {!hasSelection && (
          <div
            style={{
              background: '#fee2e2',
              color: '#b91c1c',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            Select at least one agent to start.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5f5',
              background: '#ffffff',
              color: '#475569',
              fontWeight: 500,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!hasSelection || isSubmitting}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: !hasSelection || isSubmitting ? '#93c5fd' : '#3b82f6',
              color: '#ffffff',
              fontWeight: 600,
              cursor: !hasSelection || isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            {isSubmitting ? 'Starting…' : 'Start Selected Agents'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentSessions({ eventId }: AgentSessionsProps) {
  const { data: agentData } = useAgentQuery(eventId);
  const { data: sessionsData, isLoading: sessionsQueryLoading, error: sessionsQueryError, refetch: refetchSessions } = useAgentSessionsQuery(eventId);
  
  const agent = agentData?.agent;
  
  const checkingSessions = sessionsQueryLoading;
  
  const existingAgentTypes = sessionsData?.sessions
    .filter(s => s.status === 'active' || s.status === 'paused')
    .map(s => s.agent_type) || [];
  
  const { enrichment, isLoading: enrichmentLoading, error: enrichmentError, reconnect } = useAgentSessionEnrichment(
    eventId,
    existingAgentTypes
  );
  
  const displaySessions: AgentSessionDisplay[] = (() => {
    if (!sessionsData?.sessions || !Array.isArray(sessionsData.sessions)) {
      return [];
    }
    
    return sessionsData.sessions.map(dbSession => {
      const sseData = enrichment.get(dbSession.agent_type);
      const tokenMetrics = dbSession.token_metrics || sseData?.token_metrics;
      const runtimeStats = dbSession.runtime_stats || sseData?.runtime_stats;

      return {
        ...dbSession,
        token_metrics: tokenMetrics,
        runtime_stats: runtimeStats,
        metrics_recorded_at: dbSession.metrics_recorded_at,
        websocket_state: sseData?.websocket_state,
        ping_pong: sseData?.ping_pong,
        recent_logs: sseData?.recent_logs,
      };
    });
  })();
  
  const [expandedLogs, setExpandedLogs] = useState<Record<AgentType, boolean>>({
    transcript: false,
    cards: false,
    facts: false,
  });
  const [isTestTranscriptModalOpen, setIsTestTranscriptModalOpen] = useState(false);
  const [isStartSessionsModalOpen, setIsStartSessionsModalOpen] = useState(false);
  const [startSessionsSelection, setStartSessionsSelection] = useState({
    transcript: true,
    cards: true,
    facts: true,
  });

  const createSessionsMutation = useCreateSessionsMutation(eventId);
  const startSessionsMutation = useStartSessionsMutation(eventId);
  const pauseSessionsMutation = usePauseSessionsMutation(eventId);
  const confirmReadyMutation = useConfirmReadyMutation(eventId);
  const sendTestTranscriptMutation = useSendTestTranscriptMutation(eventId);
  const resetSessionsMutation = useResetSessionsMutation(eventId);

  const handleCreateSessions = () => {
    createSessionsMutation.mutate(undefined, {
      onSuccess: async () => {
        await refetchSessions();
      },
    });
  };

  const handleStartSessions = () => {
    setStartSessionsSelection({ transcript: true, cards: true, facts: true });
    setIsStartSessionsModalOpen(true);
  };

  const handleConfirmStartSessions = (selection: { transcript: boolean; cards: boolean; facts: boolean }) => {
    startSessionsMutation.mutate(selection, {
      onSuccess: () => {
        setTimeout(() => {
          refetchSessions();
        }, 1000);
        setIsStartSessionsModalOpen(false);
      },
    });
  };

  const handleConfirmReady = () => {
    confirmReadyMutation.mutate(undefined, {
      onSuccess: () => {
        // Handled by mutation
      },
    });
  };

  const handleSendTestTranscript = (text: string, speaker: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      sendTestTranscriptMutation.mutate({ text, speaker }, {
        onSuccess: () => {
          resolve();
        },
        onError: (err) => {
          reject(err);
        },
      });
    });
  };

  const handleResetSessions = () => {
    resetSessionsMutation.mutate(undefined, {
      onSuccess: async () => {
        await refetchSessions();
      },
    });
  };

  const handlePauseSessions = () => {
    pauseSessionsMutation.mutate(undefined, {
      onSuccess: async () => {
        await refetchSessions();
      },
    });
  };

  const isStartingSessions = createSessionsMutation.isPending || startSessionsMutation.isPending;
  const isResettingSessions = resetSessionsMutation.isPending;
  const startSessionsError = createSessionsMutation.error || startSessionsMutation.error
    ? (createSessionsMutation.error instanceof Error ? createSessionsMutation.error.message : startSessionsMutation.error instanceof Error ? startSessionsMutation.error.message : 'Failed to start sessions')
    : null;
  const isPausing = pauseSessionsMutation.isPending;
  const isResuming = startSessionsMutation.isPending || confirmReadyMutation.isPending;
  const pauseResumeError = pauseSessionsMutation.error || startSessionsMutation.error || confirmReadyMutation.error
    ? (pauseSessionsMutation.error instanceof Error ? pauseSessionsMutation.error.message : startSessionsMutation.error instanceof Error ? startSessionsMutation.error.message : confirmReadyMutation.error instanceof Error ? confirmReadyMutation.error.message : 'Failed to perform operation')
    : null;

  const runtimeStats = React.useMemo(() => {
    for (const session of displaySessions) {
      if (session.runtime_stats) {
        return session.runtime_stats;
      }
    }
    return null;
  }, [displaySessions]);

  const runtimeStatsEntries = React.useMemo(() => {
    if (!runtimeStats) {
      return [];
    }

    const entries: Array<{ label: string; value: string }> = [];

    if (typeof runtimeStats.uptime_ms === 'number') {
      entries.push({
        label: 'Runtime',
        value: formatDuration(runtimeStats.uptime_ms),
      });
    }
    if (runtimeStats.transcript_last_seq !== undefined) {
      entries.push({
        label: 'Transcript Last Seq',
        value: runtimeStats.transcript_last_seq.toLocaleString(),
      });
    }
    entries.push({
      label: 'Cards Last Seq',
      value: runtimeStats.cards_last_seq.toLocaleString(),
    });
    entries.push({
      label: 'Facts Last Seq',
      value: runtimeStats.facts_last_seq.toLocaleString(),
    });
    entries.push({
      label: 'Ring Buffer Finalized',
      value: (runtimeStats.ring_buffer_stats?.finalized ?? 0).toLocaleString(),
    });
    entries.push({
      label: 'Facts Store Capacity Used',
      value: runtimeStats.facts_store_stats?.capacityUsed ?? 'N/A',
    });

    return entries;
  }, [runtimeStats]);

  const hasRuntimeStats = runtimeStatsEntries.length > 0;

  return (
    <div>
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
          Agent Sessions
        </h4>
        
        {/* Controls */}
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          {/* Start/Resume Sessions button */}
          {(() => {
            if (checkingSessions || !sessionsData) {
              return false;
            }

            const transcriptSession = displaySessions.find(s => s.agent_type === 'transcript');
            const cardsSession = displaySessions.find(s => s.agent_type === 'cards');
            const factsSession = displaySessions.find(s => s.agent_type === 'facts');

            const isNewClosed = (session: typeof cardsSession) => {
              if (!session?.status || session.status !== 'closed' || !session?.metadata?.created_at) {
                return false;
              }
              const createdTime = new Date(session.metadata.created_at).getTime();
              const now = new Date().getTime();
              const ageMs = now - createdTime;
              return ageMs < 60000;
            };

            const isPaused = (transcriptSession?.status === 'paused') || (cardsSession?.status === 'paused') || (factsSession?.status === 'paused');
            const transcriptClosed = transcriptSession?.status === 'closed';
            const cardsClosed = cardsSession?.status === 'closed';
            const factsClosed = factsSession?.status === 'closed';
            const hasClosedSessions = transcriptClosed || cardsClosed || factsClosed;
            const shouldShow = isPaused || isNewClosed(transcriptSession) || isNewClosed(cardsSession) || isNewClosed(factsSession) || hasClosedSessions;

            if (!shouldShow) {
              return false;
            }

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
                title={isPaused ? 'Resume paused sessions' : 'Start sessions'}
              >
                {isStartingSessions
                  ? (isPaused ? 'Resuming...' : 'Starting...')
                  : (isPaused ? 'Resume Sessions' : 'Start Sessions')}
              </button>
            );
          })()}

          {/* Create Sessions button */}
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

          <button
            onClick={handleResetSessions}
            disabled={isResettingSessions}
            style={{
              padding: '8px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              color: isResettingSessions ? '#9ca3af' : '#374151',
              background: isResettingSessions ? '#f3f4f6' : '#ffffff',
              cursor: isResettingSessions ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isResettingSessions) {
                e.currentTarget.style.background = '#f8fafc';
              }
            }}
            onMouseLeave={(e) => {
              if (!isResettingSessions) {
                e.currentTarget.style.background = '#ffffff';
              }
            }}
            title="Delete existing sessions and reset agent to context_complete"
          >
            {isResettingSessions ? 'Resetting...' : 'Reset Sessions'}
          </button>
          
          {/* Pause Sessions button */}
          {(() => {
            if (checkingSessions || !sessionsData) {
              return false;
            }
            const transcriptSession = displaySessions.find(s => s.agent_type === 'transcript');
            const cardsSession = displaySessions.find(s => s.agent_type === 'cards');
            const factsSession = displaySessions.find(s => s.agent_type === 'facts');
            return (transcriptSession?.status === 'active' || cardsSession?.status === 'active' || factsSession?.status === 'active');
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
          
          {/* Testing state buttons */}
          {agent?.status === 'active' && agent?.stage === 'testing' && (
            <>
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
          
          {/* Refresh button */}
          <button
            onClick={() => {
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
      
      {hasRuntimeStats && (
        <section
          style={{
            marginBottom: '24px',
            padding: '20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          }}
        >
          <header style={{ marginBottom: '16px' }}>
            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
              Runtime Stats
            </h5>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
              Shared telemetry across active realtime agents.
            </p>
          </header>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            {runtimeStatsEntries.map(({ label, value }) => (
              <div
                key={label}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {label}
                </div>
                <div style={{ marginTop: '6px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sessionsQueryError && (
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
            fontWeight: '600',
            marginBottom: '4px',
          }}>
            Error loading sessions:
          </div>
          <div style={{
            fontSize: '12px',
            color: '#dc2626',
          }}>
            {sessionsQueryError instanceof Error ? sessionsQueryError.message : String(sessionsQueryError)}
          </div>
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
        <>
          {/* Realtime Sessions */}
          {(() => {
            const realtimeSessions = displaySessions.filter(
              (session) => session.transport === 'realtime'
            );
            if (realtimeSessions.length === 0) return null;

            return (
              <div style={{ marginBottom: '32px' }}>
                <h5
                  style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '16px',
                  }}
                >
                  Realtime Sessions
                </h5>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {realtimeSessions.map((session) => (
                    <SessionStatusCard
                      key={`${session.agent_type}-${session.session_id}-${session.status}`}
                      title={agentTitles[session.agent_type]}
                      session={session}
                      expandedLogs={expandedLogs}
                      setExpandedLogs={setExpandedLogs}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Stateless Sessions */}
          {(() => {
            const statelessSessions = displaySessions.filter(
              (session) => session.transport === 'stateless'
            );
            if (statelessSessions.length === 0) return null;

            return (
              <div>
                <h5
                  style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '16px',
                  }}
                >
                  Stateless Sessions
                </h5>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {statelessSessions.map((session) => (
                    <SessionStatusCard
                      key={`${session.agent_type}-${session.session_id}-${session.status}`}
                      title={agentTitles[session.agent_type]}
                      session={session}
                      expandedLogs={expandedLogs}
                      setExpandedLogs={setExpandedLogs}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {isStartSessionsModalOpen && (
        <StartSessionsModal
          isOpen={isStartSessionsModalOpen}
          selection={startSessionsSelection}
          onSelectionChange={setStartSessionsSelection}
          onConfirm={() => handleConfirmStartSessions(startSessionsSelection)}
          onClose={() => setIsStartSessionsModalOpen(false)}
          isSubmitting={startSessionsMutation.isPending}
        />
      )}

      {isTestTranscriptModalOpen && (
        <TestTranscriptModal
          eventId={eventId}
          isOpen={isTestTranscriptModalOpen}
          onClose={() => setIsTestTranscriptModalOpen(false)}
          onSend={handleSendTestTranscript}
        />
      )}
    </div>
  );
}

