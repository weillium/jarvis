'use client';

import React, { useState } from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useAgentSessionEnrichment } from '@/shared/hooks/use-agent-sessions';
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
import { SessionStatusCard } from './session-status-card';
import { StartSessionsModal } from './start-sessions-modal';
import { calculateOpenAICost } from '@/shared/utils/pricing';
import type { AgentSessionDisplay, AgentType } from './agent-sessions-utils';
import { agentTitles, defaultAgentModels, inferPromptShareFromMetrics, formatDuration } from './agent-sessions-utils';

interface AgentSessionsProps {
  eventId: string;
}

export function AgentSessions({ eventId }: AgentSessionsProps) {
  const { data: agentData } = useAgentQuery(eventId);
  const { data: sessionsData, isLoading: sessionsQueryLoading, error: sessionsQueryError, refetch: refetchSessions } = useAgentSessionsQuery(eventId);
  
  const agent = agentData?.agent;
  
  const checkingSessions = sessionsQueryLoading;
  
  const existingAgentTypes =
    sessionsData?.sessions?.map((session) => session.agent_type) ?? [];
  
  const { enrichment, isLoading: enrichmentLoading, error: enrichmentError, reconnect } = useAgentSessionEnrichment(
    eventId,
    existingAgentTypes,
    {
      refetchSessions,
      connectWhenEmpty: true,
    }
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
        reconnect();
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

  const runtimeCostSummary = React.useMemo(() => {
    if (displaySessions.length === 0) {
      return null;
    }

    let totalCost = 0;
    let totalTokens = 0;
    let totalRequests = 0;

    const breakdownMap = new Map<AgentType, { cost: number; model: string }>();

    for (const session of displaySessions) {
      const metrics = session.token_metrics;
      if (!metrics) {
        continue;
      }

      const totalTokensForSession = Number(metrics.total_tokens ?? 0);
      if (!Number.isFinite(totalTokensForSession) || totalTokensForSession <= 0) {
        continue;
      }

      const modelKey =
        session.metadata.model && session.metadata.model.length > 0
          ? session.metadata.model
          : defaultAgentModels[session.agent_type];

      const promptShare = inferPromptShareFromMetrics(metrics);
      const promptTokens = Math.round(totalTokensForSession * promptShare);
      const completionTokens = Math.max(totalTokensForSession - promptTokens, 0);

      const cost = calculateOpenAICost(
        {
          total_tokens: totalTokensForSession,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
        },
        modelKey,
        false
      );

      totalCost += cost;
      totalTokens += totalTokensForSession;
      totalRequests += metrics.request_count ?? 0;

      const existing = breakdownMap.get(session.agent_type);
      if (existing) {
        existing.cost += cost;
      } else {
        breakdownMap.set(session.agent_type, { cost, model: modelKey });
      }
    }

    if (totalTokens === 0) {
      return null;
    }

    const breakdown = Array.from(breakdownMap.entries()).map(([agent, data]) => ({
      agent,
      cost: data.cost,
      model: data.model,
    }));

    return {
      totalCost,
      totalTokens,
      totalRequests,
      breakdown,
    };
  }, [displaySessions]);

  const runtimeStatsEntries = React.useMemo(() => {
    const entries: Array<{ label: string; value: string }> = [];

    if (runtimeCostSummary) {
      entries.push({
        label: 'Runtime Cost',
        value: `$${runtimeCostSummary.totalCost.toFixed(4)} (${runtimeCostSummary.totalTokens.toLocaleString()} tokens · ${runtimeCostSummary.totalRequests.toLocaleString()} req)`,
      });
    }

    if (!runtimeStats) {
      return entries;
    }

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
  }, [runtimeStats, runtimeCostSummary]);

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
          {runtimeCostSummary?.breakdown.length ? (
            <div
              style={{
                marginTop: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  fontWeight: 600,
                  marginBottom: '8px',
                }}
              >
                Cost Breakdown
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '12px',
                  color: '#475569',
                }}
              >
                {runtimeCostSummary.breakdown.map(({ agent, cost, model }) => (
                  <div
                    key={agent}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{agentTitles[agent]}</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      ${cost.toFixed(4)}
                      {model ? ` · ${model}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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

