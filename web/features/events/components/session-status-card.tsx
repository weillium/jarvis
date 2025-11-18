'use client';

import React, { useState, useEffect } from 'react';
import type { AgentSessionDisplay, AgentType } from './agent-sessions-utils';
import { getSessionStatusColor, getSessionStatusLabel, formatDate, formatDuration } from './agent-sessions-utils';

interface SessionStatusCardProps {
  title: string;
  session: AgentSessionDisplay;
  expandedLogs: Record<AgentType, boolean>;
  setExpandedLogs: React.Dispatch<React.SetStateAction<Record<AgentType, boolean>>>;
}

export function SessionStatusCard({ title, session, expandedLogs, setExpandedLogs }: SessionStatusCardProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const actualWebSocketState = session.websocket_state;
  const isWebSocketLive = actualWebSocketState === 'OPEN';

  const shouldTick = isWebSocketLive && !session.runtime_stats?.uptime_ms;

  useEffect(() => {
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
    const startTimestampMs = (() => {
      if (session.metadata.last_connected_at) {
        return new Date(session.metadata.last_connected_at).getTime();
      }
      if (session.metadata.created_at) {
        return new Date(session.metadata.created_at).getTime();
      }
      return null;
    })();

    if (startTimestampMs === null || Number.isNaN(startTimestampMs)) {
      return null;
    }

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

    const diffMs = endTimestampMs - startTimestampMs;
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
          {session.agent_type === 'facts' && session.token_metrics.facts_budget && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
              }}>
                Facts Prompt Budget (last run)
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>Selected Facts</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                    {session.token_metrics.facts_budget.selected} / {session.token_metrics.facts_budget.total_facts}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>Overflow Facts</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                    {session.token_metrics.facts_budget.overflow}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>Summaries Added</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                    {session.token_metrics.facts_budget.summary}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>Tokens Used / Budget</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                    {session.token_metrics.facts_budget.used_tokens} / {session.token_metrics.facts_budget.budget_tokens}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                Selection Ratio:{' '}
                {(session.token_metrics.facts_budget.selection_ratio * 100).toFixed(1)}%
              </div>
              <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                Merged Clusters: {session.token_metrics.facts_budget.merged_clusters}
              </div>
              {session.token_metrics.facts_budget.merged_facts.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Merged Facts
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569' }}>
                    {session.token_metrics.facts_budget.merged_facts.slice(0, 5).map((merged, idx) => (
                      <li key={`${merged.representative}-${idx}`}>
                        <span style={{ fontWeight: 600 }}>{merged.representative}</span>
                        {merged.members.length > 0 && (
                          <span style={{ opacity: 0.8 }}>
                            {' '}
                            ← {merged.members.join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {session.token_metrics.facts_budget.merged_facts.length > 5 && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      +{session.token_metrics.facts_budget.merged_facts.length - 5} additional merges
                    </div>
                  )}
                </div>
              )}
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
                    {(() => {
                      const seqEntry = log.context?.find(
                        (entry) => entry.key === 'seq' && typeof entry.value === 'number'
                      );
                      return seqEntry ? ` • Seq ${seqEntry.value}` : null;
                    })()}
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

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

