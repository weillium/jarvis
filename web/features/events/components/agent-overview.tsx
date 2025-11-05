'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
import { useAgentSessions, AgentSessionStatus } from '@/shared/hooks/use-agent-sessions';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { TestTranscriptModal } from './test-transcript-modal';

interface AgentOverviewProps {
  eventId: string;
}

export function AgentOverview({ eventId }: AgentOverviewProps) {
  const { data: agentData, isLoading, error, refetch } = useAgentQuery(eventId);
  const { data: cycles } = useContextVersionsQuery(eventId);
  
  const agent = agentData?.agent;
  const contextStats = agentData?.contextStats;
  const blueprint = agentData?.blueprint;
  const [hasActiveSessions, setHasActiveSessions] = useState(false);
  const [checkingSessions, setCheckingSessions] = useState(true);
  const checkingRef = useRef(false);
  const [initialSessions, setInitialSessions] = useState<AgentSessionStatus[]>([]);
  
  // Check if sessions exist and determine if SSE should connect (only for active)
  const checkForActiveSessions = useCallback(async () => {
    if (!eventId) {
      setCheckingSessions(false);
      checkingRef.current = false;
      return;
    }
    
    // Prevent concurrent checks
    if (checkingRef.current) {
      return;
    }
    
    checkingRef.current = true;
    setCheckingSessions(true);
    
    try {
      const res = await fetch(`/api/agent-sessions/${eventId}/check`);
      const data = await res.json();
      
      if (data.ok) {
        // Store initial sessions data for immediate display (any status)
        if (data.sessions && data.sessions.length > 0) {
          const sessions: AgentSessionStatus[] = data.sessions.map((s: any) => ({
            agent_type: s.agent_type,
            session_id: s.session_id || 'pending',
            status: s.status,
            metadata: s.metadata || {
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              closed_at: null,
            },
          }));
          setInitialSessions(sessions);
        } else {
          setInitialSessions([]);
        }
        
        // Only set hasActiveSessions to true if sessions are active (for SSE connection)
        setHasActiveSessions(data.hasActiveSessions || false);
      } else {
        setHasActiveSessions(false);
        setInitialSessions([]);
      }
    } catch (err) {
      console.error('[AgentOverview] Failed to check for active sessions:', err);
      setHasActiveSessions(false);
      setInitialSessions([]);
    } finally {
      setCheckingSessions(false);
      checkingRef.current = false;
    }
  }, [eventId]);
  
  useEffect(() => {
    checkForActiveSessions();
    
    // Poll periodically to check for sessions
    // - Every 5 seconds if not connected (to detect when sessions advance to active)
    // - Every 30 seconds if connected (to detect if connection dropped and sessions are still active)
    const pollInterval = hasActiveSessions ? 30000 : 5000;
    const interval = setInterval(() => {
      checkForActiveSessions();
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [checkForActiveSessions, hasActiveSessions]);
  
  // Only connect to SSE when sessions actually exist and are active
  const shouldConnectToSessions = useCallback(() => {
    return hasActiveSessions;
  }, [hasActiveSessions]);
  
  const { cards: cardsStatus, facts: factsStatus, isLoading: sessionsLoading, error: sessionsError, reconnect } = useAgentSessions(eventId, shouldConnectToSessions);
  
  // Clear initial sessions when SSE provides updates (to avoid showing stale data)
  useEffect(() => {
    if (cardsStatus || factsStatus) {
      setInitialSessions([]);
    }
  }, [cardsStatus, factsStatus]);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<{ cards: boolean; facts: boolean }>({ cards: false, facts: false });
  const [isStartingSessions, setIsStartingSessions] = useState(false);
  const [startSessionsError, setStartSessionsError] = useState<string | null>(null);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [pauseResumeError, setPauseResumeError] = useState<string | null>(null);
  const [isTestTranscriptModalOpen, setIsTestTranscriptModalOpen] = useState(false);

  // Calculate total cost from cycles (from React Query)
  const totalCost = cycles?.reduce((sum: number, cycle: any) => {
    const cycleCost = cycle.cost;
    return sum + (cycleCost !== null && cycleCost !== undefined ? parseFloat(cycleCost) : 0);
  }, 0) ?? null;

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

  const getStatusColor = (status: string | null, stage?: string | null): string => {
    if (!status) return '#6b7280';
    
    if (status === 'error') return '#ef4444'; // red
    if (status === 'ended') return '#6b7280'; // gray
    if (status === 'paused') return '#f59e0b'; // amber
    if (status === 'active') {
      return stage === 'running' ? '#3b82f6' : stage === 'testing' ? '#8b5cf6' : '#3b82f6'; // blue/purple
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint': return '#8b5cf6'; // purple
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

  const getStatusLabel = (status: string | null, stage?: string | null): string => {
    if (!status) return 'Unknown';
    
    if (status === 'error') return 'Error';
    if (status === 'ended') return 'Ended';
    if (status === 'paused') return 'Paused';
    if (status === 'active') {
      return stage === 'running' ? 'Running' : stage === 'testing' ? 'Testing' : 'Active';
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint': return 'Blueprint';
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
      
      // Immediately check for sessions (they will be in 'closed' state)
      // This will display them immediately, but SSE won't connect until they advance to active
      await checkForActiveSessions();
      
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
      
      // Check for sessions - they should now be in 'active' state
      // This will trigger SSE connection since they're now active
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
      
      // Update session status directly from API - don't rely on SSE for status changes
      // Fetch updated sessions and update local state immediately
      const sessionRes = await fetch(`/api/agent-sessions/${eventId}/check`);
      const sessionData = await sessionRes.json();
      
      if (sessionData.ok && sessionData.sessions) {
        const updatedSessions: AgentSessionStatus[] = sessionData.sessions.map((s: any) => ({
          agent_type: s.agent_type,
          session_id: s.session_id || 'pending',
          status: s.status,
          metadata: s.metadata || {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: null,
          },
        }));
        setInitialSessions(updatedSessions);
      }
      
      // Update hasActiveSessions (SSE will disconnect since sessions are now paused)
      await checkForActiveSessions();
      
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
      
      // Update session status directly from API - don't rely on SSE for status changes
      // Fetch updated sessions and update local state immediately
      const sessionRes = await fetch(`/api/agent-sessions/${eventId}/check`);
      const sessionData = await sessionRes.json();
      
      if (sessionData.ok && sessionData.sessions) {
        const updatedSessions: AgentSessionStatus[] = sessionData.sessions.map((s: any) => ({
          agent_type: s.agent_type,
          session_id: s.session_id || 'pending',
          status: s.status,
          metadata: s.metadata || {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            closed_at: null,
          },
        }));
        setInitialSessions(updatedSessions);
      }
      
      // Update hasActiveSessions (SSE will reconnect when sessions become active)
      await checkForActiveSessions();
      
      console.log('[AgentOverview] Sessions will be resumed by worker');
    } catch (err: any) {
      console.error('Failed to resume sessions:', err);
      setPauseResumeError(err.message || 'Failed to resume sessions');
    } finally {
      setIsResuming(false);
    }
  };

  const getSessionStatusColor = (status: string, created_at?: string): string => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'paused':
        return '#8b5cf6'; // Purple for paused
      case 'closed':
        // Check if closed session is new (created in last minute)
        if (created_at) {
          const created = new Date(created_at);
          const now = new Date();
          if (now.getTime() - created.getTime() < 60000) {
            return '#64748b'; // Gray for new (not started)
          }
        }
        return '#6b7280'; // Dark gray for old closed
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getSessionStatusLabel = (status: string, created_at?: string): string => {
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

  const SessionStatusCard = ({ title, status }: { title: string; status: AgentSessionStatus | null }) => {
    if (!status) return null;

    const statusColor = getSessionStatusColor(status.status, status.metadata?.created_at);
    const statusLabel = getSessionStatusLabel(status.status, status.metadata?.created_at);
    const agentType = status.agent_type;
    const isExpanded = expandedLogs[agentType];

    // Determine WebSocket connection status
    // Prefer actual WebSocket state if available, otherwise fall back to status field
    const actualWebSocketState = status.websocket_state;
    const isWebSocketLive = actualWebSocketState === 'OPEN' || (actualWebSocketState === undefined && status.status === 'active');
    
    // Determine connection status label
    let connectionStatus: string;
    let connectionColor: string;
    
    if (actualWebSocketState) {
      // Use actual WebSocket readyState
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
          connectionStatus = status.status === 'paused' ? 'Paused' : 'Disconnected';
          connectionColor = status.status === 'paused' ? '#8b5cf6' : '#6b7280';
      }
    } else {
      // Fall back to database status
      // Check if closed session is new (created in last minute)
      const isNewClosed = status.status === 'closed' && status.metadata?.created_at && 
        (new Date().getTime() - new Date(status.metadata.created_at).getTime()) < 60000;
      connectionStatus = status.status === 'active' ? 'Live' : status.status === 'paused' ? 'Paused' : isNewClosed ? 'Ready' : 'Disconnected';
      connectionColor = status.status === 'active' ? '#10b981' : status.status === 'paused' ? '#8b5cf6' : isNewClosed ? '#64748b' : '#6b7280';
    }

    // Real-time runtime calculation with state to trigger updates
    const [currentTime, setCurrentTime] = useState(new Date());
    
    useEffect(() => {
      if (!isWebSocketLive || !status.metadata.created_at) return;
      
      // Update every second when session is active
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
      
      return () => clearInterval(interval);
    }, [isWebSocketLive, status.metadata.created_at]);

    // Calculate runtime (how long session has been running)
    const calculateRuntime = () => {
      if (!status.metadata.created_at) return null;
      
      const created = new Date(status.metadata.created_at);
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
          {status.websocket_state && status.websocket_state === 'OPEN' && (
            <div style={{
              marginBottom: '8px',
              padding: '8px 12px',
              background: status.ping_pong?.missedPongs === 0 ? '#f0fdf4' : status.ping_pong?.missedPongs === 1 ? '#fffbeb' : '#fef2f2',
              borderRadius: '6px',
              border: `1px solid ${status.ping_pong?.missedPongs === 0 ? '#bbf7d0' : status.ping_pong?.missedPongs === 1 ? '#fde68a' : '#fecaca'}`,
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
                  color: status.ping_pong?.missedPongs === 0 ? '#166534' : status.ping_pong?.missedPongs === 1 ? '#92400e' : '#991b1b',
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
                  {status.ping_pong?.missedPongs === 0 && (
                    <span style={{ fontSize: '12px' }}>✓ Healthy</span>
                  )}
                  {status.ping_pong?.missedPongs === 1 && (
                    <span style={{ fontSize: '12px', color: '#d97706' }}>⚠ 1 Missed</span>
                  )}
                  {status.ping_pong && status.ping_pong.missedPongs >= 2 && (
                    <span style={{ fontSize: '12px', color: '#dc2626' }}>⚠⚠ {status.ping_pong.missedPongs} Missed</span>
                  )}
                </div>
              </div>
              {status.ping_pong?.enabled && (
                <div style={{
                  fontSize: '10px',
                  color: '#64748b',
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}>
                  {status.ping_pong.lastPongReceived && (
                    <span>
                      Last pong: {new Date(status.ping_pong.lastPongReceived).toLocaleTimeString()}
                    </span>
                  )}
                  <span>
                    Ping interval: {Math.round((status.ping_pong.pingIntervalMs || 0) / 1000)}s
                  </span>
                  {status.ping_pong.missedPongs > 0 && (
                    <span style={{ color: '#dc2626', fontWeight: '600' }}>
                      {status.ping_pong.missedPongs}/{status.ping_pong.maxMissedPongs} missed
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
            {status.session_id === 'pending' || (status.status === 'closed' && status.metadata?.created_at && 
              (new Date().getTime() - new Date(status.metadata.created_at).getTime()) < 60000) ? (
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
          {error || 'No agent found for this event'}
        </p>
      </div>
    );
  }

  const statusColor = getStatusColor(agent.status, agent.stage);
  const statusLabel = getStatusLabel(agent.status, agent.stage);

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
                onClick={() => {
                  // Refresh session check first, then reconnect SSE if needed
                  checkForActiveSessions();
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
              
              {/* Create Sessions button - visible when agent is context_complete AND no sessions exist */}
              {agent?.status === 'idle' && agent?.stage === 'context_complete' && 
               !cardsStatus && 
               !factsStatus && 
               !sessionsLoading && 
               !checkingSessions && (
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
              {/* Show button when: sessions are 'closed' (new, created in last minute) or 'paused' (resume) */}
              {/* Works for both 'testing' and 'running' agent status */}
              {(() => {
                const isNewClosed = (s: typeof cardsStatus) => 
                  s?.status === 'closed' && s?.metadata?.created_at && 
                  (new Date().getTime() - new Date(s.metadata.created_at).getTime()) < 60000;
                return (
                  (isNewClosed(cardsStatus) && (isNewClosed(factsStatus) || !factsStatus)) ||
                  (!cardsStatus && isNewClosed(factsStatus)) ||
                  (cardsStatus?.status === 'paused' && factsStatus?.status === 'paused') ||
                  (cardsStatus?.status === 'paused' && !factsStatus) ||
                  (!cardsStatus && factsStatus?.status === 'paused') ||
                  // Also show if we're in testing/running state but haven't received status yet (sessions might be loading)
                  (!cardsStatus && !factsStatus && ((agent?.status === 'active' && agent?.stage === 'testing') || (agent?.status === 'active' && agent?.stage === 'running')) && sessionsLoading)
                );
              })() && (
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
                      title={(cardsStatus?.status === 'paused' || factsStatus?.status === 'paused') 
                        ? 'Resume paused sessions' 
                        : 'Start sessions'}
                    >
                      {isStartingSessions 
                        ? (cardsStatus?.status === 'paused' || factsStatus?.status === 'paused' 
                            ? 'Resuming...' 
                            : 'Starting...')
                        : (cardsStatus?.status === 'paused' || factsStatus?.status === 'paused' 
                            ? 'Resume Sessions' 
                            : 'Start Sessions')}
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

          {(sessionsLoading || checkingSessions) && !cardsStatus && !factsStatus && initialSessions.length === 0 && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
            }}>
              Loading session status...
            </div>
          )}

          {!sessionsLoading && !checkingSessions && !cardsStatus && !factsStatus && !sessionsError && initialSessions.length === 0 && (
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

          {(cardsStatus || factsStatus || initialSessions.length > 0) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '16px',
            }}>
              {/* Cards Agent Session - prefer SSE data, fallback to initial sessions */}
              {(cardsStatus || initialSessions.find(s => s.agent_type === 'cards')) && (
                <SessionStatusCard
                  key={`cards-${cardsStatus?.session_id || initialSessions.find(s => s.agent_type === 'cards')?.session_id}-${cardsStatus?.status || initialSessions.find(s => s.agent_type === 'cards')?.status}-${cardsStatus?.metadata?.updated_at || initialSessions.find(s => s.agent_type === 'cards')?.metadata?.updated_at || Date.now()}`}
                  title="Cards Agent"
                  status={cardsStatus || initialSessions.find(s => s.agent_type === 'cards') || null}
                />
              )}
              
              {/* Facts Agent Session - prefer SSE data, fallback to initial sessions */}
              {(factsStatus || initialSessions.find(s => s.agent_type === 'facts')) && (
                <SessionStatusCard
                  key={`facts-${factsStatus?.session_id || initialSessions.find(s => s.agent_type === 'facts')?.session_id}-${factsStatus?.status || initialSessions.find(s => s.agent_type === 'facts')?.status}-${factsStatus?.metadata?.updated_at || initialSessions.find(s => s.agent_type === 'facts')?.metadata?.updated_at || Date.now()}`}
                  title="Facts Agent"
                  status={factsStatus || initialSessions.find(s => s.agent_type === 'facts') || null}
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

