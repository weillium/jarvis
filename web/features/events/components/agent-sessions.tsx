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
import { YStack, XStack, Text, Button, Card, Alert, EmptyStateCard, Label } from '@jarvis/ui-core';

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
    <YStack padding="$8">
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$4"
        flexWrap="wrap"
        gap="$2"
      >
        <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
          Agent Sessions
        </Text>
        
        {/* Controls */}
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
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
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartSessions}
                disabled={isStartingSessions}
              >
                {isStartingSessions
                  ? (isPaused ? 'Resuming...' : 'Starting...')
                  : (isPaused ? 'Resume Sessions' : 'Start Sessions')}
              </Button>
            );
          })()}

          {/* Create Sessions button */}
          {agent?.status === 'idle' && agent?.stage === 'context_complete' && 
           !checkingSessions && 
           sessionsData && 
           !sessionsData.hasSessions && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateSessions}
              disabled={isStartingSessions}
            >
              {isStartingSessions ? 'Creating...' : 'Create Sessions'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetSessions}
            disabled={isResettingSessions}
          >
            {isResettingSessions ? 'Resetting...' : 'Reset Sessions'}
          </Button>
          
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
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseSessions}
              disabled={isPausing}
            >
              {isPausing ? 'Pausing...' : 'Pause Sessions'}
            </Button>
          )}
          
          {/* Testing state buttons */}
          {agent?.status === 'active' && agent?.stage === 'testing' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTestTranscriptModalOpen(true)}
              >
                Test Transcript
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleConfirmReady}
                disabled={isResuming}
              >
                {isResuming ? 'Processing...' : 'Confirm Ready'}
              </Button>
            </>
          )}
          
          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchSessions();
              reconnect();
            }}
          >
            Refresh
          </Button>
        </XStack>
      </XStack>
      
      {(pauseResumeError || startSessionsError) && (
        <Alert variant="error" marginBottom="$4">
          {pauseResumeError || startSessionsError}
        </Alert>
      )}
      
      {hasRuntimeStats && (
        <Card variant="outlined" padding="$5" marginBottom="$6">
          <YStack marginBottom="$4">
            <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
              Runtime Stats
            </Text>
            <Text fontSize="$2" color="$gray11" margin="$1.5 0 0 0" marginTop="$1.5">
              Shared telemetry across active realtime agents.
            </Text>
          </YStack>
          <XStack
            flexWrap="wrap"
            gap="$3"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            {runtimeStatsEntries.map(({ label, value }) => (
              <Card
                key={label}
                variant="outlined"
                backgroundColor="$gray1"
                padding="$4"
                borderRadius="$2.5"
                flex={1}
                minWidth={160}
              >
                <Label
                  size="xs"
                  tone="muted"
                  uppercase
                  letterSpacing={0.4}
                  margin={0}
                >
                  {label}
                </Label>
                <Text fontSize="$3" fontWeight="600" color="$color" marginTop="$1.5" margin={0}>
                  {value}
                </Text>
              </Card>
            ))}
          </XStack>
          {runtimeCostSummary?.breakdown.length ? (
            <YStack marginTop="$4">
              <Label
                size="xs"
                tone="muted"
                uppercase
                letterSpacing={0.4}
                marginBottom="$2"
                margin={0}
              >
                Cost Breakdown
              </Label>
              <YStack gap="$1">
                {runtimeCostSummary.breakdown.map(({ agent, cost, model }) => (
                  <XStack
                    key={agent}
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Text fontSize="$2" color="$gray9" margin={0}>
                      {agentTitles[agent]}
                    </Text>
                    <Text fontSize="$2" color="$gray9" fontFamily="$mono" margin={0}>
                      ${cost.toFixed(4)}
                      {model ? ` · ${model}` : ''}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          ) : null}
        </Card>
      )}

      {sessionsQueryError && (
        <Alert variant="error" marginBottom="$4">
          <YStack gap="$1">
            <Text fontSize="$2" fontWeight="600" color="$red11" margin={0}>
              Error loading sessions:
            </Text>
            <Text fontSize="$2" color="$red11" margin={0}>
              {sessionsQueryError instanceof Error ? sessionsQueryError.message : String(sessionsQueryError)}
            </Text>
          </YStack>
        </Alert>
      )}

      {enrichmentError && (
        <Alert variant="error" marginBottom="$4">
          <Text fontSize="$2" margin={0}>
            Error connecting to enrichment stream: {enrichmentError.message}
          </Text>
        </Alert>
      )}

      {checkingSessions && displaySessions.length === 0 && (
        <EmptyStateCard
          title="Loading session status"
          description="Checking for active agent sessions."
          padding="$6"
          titleLevel={5}
          align="center"
        />
      )}

      {!checkingSessions && displaySessions.length === 0 && !enrichmentError && (
        <EmptyStateCard
          title="No active agent sessions"
          description={
            agent?.status === 'idle' && (agent?.stage === 'ready' || agent?.stage === 'context_complete')
              ? 'Use the "Create Sessions" button above to begin.'
              : agent?.status === 'active' && agent?.stage === 'running'
              ? 'Waiting for sessions to be created...'
              : 'Agent sessions are available only when the event is running.'
          }
          padding="$6"
          titleLevel={5}
          align="center"
        />
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
              <YStack marginTop="$6" marginBottom="$8">
                <Label
                  size="xs"
                  tone="muted"
                  uppercase
                  letterSpacing={0.5}
                  marginBottom="$4"
                  margin={0}
                >
                  Realtime Sessions
                </Label>
                <XStack
                  flexWrap="wrap"
                  gap="$4"
                  marginTop="$2"
                  $sm={{ flexDirection: 'column' }}
                  $md={{ flexDirection: 'row' }}
                >
                  {realtimeSessions.map((session) => (
                    <XStack key={`${session.agent_type}-${session.session_id}-${session.status}`} flexBasis="50%" flexShrink={1} flexGrow={1} minWidth={0} $sm={{ flexBasis: '100%' }}>
                      <SessionStatusCard
                        title={agentTitles[session.agent_type]}
                        session={session}
                        expandedLogs={expandedLogs}
                        setExpandedLogs={setExpandedLogs}
                      />
                    </XStack>
                  ))}
                </XStack>
              </YStack>
            );
          })()}

          {/* Stateless Sessions */}
          {(() => {
            const statelessSessions = displaySessions.filter(
              (session) => session.transport === 'stateless'
            );
            if (statelessSessions.length === 0) return null;

            return (
              <YStack marginTop="$6">
                <Label
                  size="xs"
                  tone="muted"
                  uppercase
                  letterSpacing={0.5}
                  marginBottom="$4"
                  margin={0}
                >
                  Stateless Sessions
                </Label>
                <XStack
                  flexWrap="wrap"
                  gap="$4"
                  marginTop="$2"
                  $sm={{ flexDirection: 'column' }}
                  $md={{ flexDirection: 'row' }}
                >
                  {statelessSessions.map((session) => (
                    <XStack key={`${session.agent_type}-${session.session_id}-${session.status}`} flexBasis="50%" flexShrink={1} flexGrow={1} minWidth={0} $sm={{ flexBasis: '100%' }}>
                      <SessionStatusCard
                        title={agentTitles[session.agent_type]}
                        session={session}
                        expandedLogs={expandedLogs}
                        setExpandedLogs={setExpandedLogs}
                      />
                    </XStack>
                  ))}
                </XStack>
              </YStack>
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
    </YStack>
  );
}
