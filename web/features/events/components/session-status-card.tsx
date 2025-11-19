'use client';

import React, { useState, useEffect } from 'react';
import { YStack, XStack, Text, Button, Card, Alert } from '@jarvis/ui-core';
import type { AgentSessionDisplay, AgentType } from './agent-sessions-utils';
import { getSessionStatusColor, getSessionStatusColorHex, getSessionStatusLabel, formatDate, formatDuration } from './agent-sessions-utils';

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
  const statusColorHex = getSessionStatusColorHex(session.status);
  const statusLabel = getSessionStatusLabel(session.status);
  const agentType = session.agent_type;
  const isExpanded = expandedLogs[agentType];
  const isRealtime = session.transport === 'realtime';
  const runtimeLabel = 'Runtime';
  
  let connectionStatus: string;
  let connectionColor: string;
  let connectionColorToken: string;
  
  if (actualWebSocketState) {
    switch (actualWebSocketState) {
      case 'OPEN':
        connectionStatus = 'Live';
        connectionColor = '#10b981';
        connectionColorToken = '$green11';
        break;
      case 'CONNECTING':
        connectionStatus = 'Connecting';
        connectionColor = '#f59e0b';
        connectionColorToken = '$yellow11';
        break;
      case 'CLOSING':
        connectionStatus = 'Closing';
        connectionColor = '#f59e0b';
        connectionColorToken = '$yellow11';
        break;
      case 'CLOSED':
        connectionStatus = 'Disconnected';
        connectionColor = '#6b7280';
        connectionColorToken = '$gray11';
        break;
      default:
        connectionStatus = session.status === 'paused' ? 'Paused' : 'Disconnected';
        connectionColor = session.status === 'paused' ? '#8b5cf6' : '#6b7280';
        connectionColorToken = session.status === 'paused' ? '$purple11' : '$gray11';
    }
  } else {
    const isNewClosed = session.status === 'closed' && session.metadata?.created_at && 
      (new Date().getTime() - new Date(session.metadata.created_at).getTime()) < 60000;
    if (session.status === 'active') {
      connectionStatus = 'Awaiting SSE';
      connectionColor = '#f59e0b';
      connectionColorToken = '$yellow11';
    } else if (session.status === 'paused') {
      connectionStatus = 'Paused';
      connectionColor = '#8b5cf6';
      connectionColorToken = '$purple11';
    } else if (isNewClosed) {
      connectionStatus = 'Ready';
      connectionColor = '#64748b';
      connectionColorToken = '$gray11';
    } else {
      connectionStatus = 'Disconnected';
      connectionColor = '#6b7280';
      connectionColorToken = '$gray11';
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

  const pingPongMissed = session.ping_pong?.missedPongs ?? 0;
  const pingPongVariant = pingPongMissed === 0 ? 'success' : pingPongMissed === 1 ? 'warning' : 'error';

  return (
    <Card variant="outlined" padding="$5">
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$4"
      >
        <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
          {title}
        </Text>
        <XStack alignItems="center" gap="$2">
          <YStack
            width={8}
            height={8}
            borderRadius="$10"
            backgroundColor={statusColorHex}
          />
          <Text fontSize="$3" fontWeight="500" color={statusColor}>
            {statusLabel}
          </Text>
        </XStack>
      </XStack>

      {/* Connection Status & Runtime */}
      <YStack
        marginBottom="$4"
        paddingBottom="$4"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
      >
        {isRealtime && (
          <>
            <XStack
              alignItems="center"
              gap="$2"
              marginBottom="$2"
            >
              <YStack
                width={8}
                height={8}
                borderRadius="$10"
                backgroundColor={connectionColor}
                style={{
                  animation: isWebSocketLive ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                }}
              />
              <Text
                fontSize="$2"
                fontWeight="600"
                color={connectionColorToken}
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                WebSocket: {connectionStatus}
                {actualWebSocketState && (
                  <Text
                    fontSize="$1"
                    fontWeight="400"
                    marginLeft="$1.5"
                    opacity={0.7}
                    textTransform="none"
                  >
                    ({actualWebSocketState})
                  </Text>
                )}
              </Text>
            </XStack>

            {actualWebSocketState === 'OPEN' && (
              <Alert
                variant={pingPongVariant}
                marginBottom="$2"
              >
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  marginBottom="$1"
                >
                  <Text
                    fontSize="$1"
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Connection Health
                  </Text>
                  <XStack alignItems="center" gap="$1">
                    {pingPongMissed === 0 && (
                      <Text fontSize="$2">✓ Healthy</Text>
                    )}
                    {pingPongMissed === 1 && (
                      <Text fontSize="$2" color="$yellow11">⚠ 1 Missed</Text>
                    )}
                    {pingPongMissed >= 2 && (
                      <Text fontSize="$2" color="$red11">
                        ⚠⚠ {pingPongMissed} Missed
                      </Text>
                    )}
                  </XStack>
                </XStack>
                {session.ping_pong?.enabled && (
                  <XStack
                    fontSize="$1"
                    color="$gray11"
                    gap="$3"
                    flexWrap="wrap"
                  >
                    {session.ping_pong.lastPongReceived && (
                      <Text>
                        Last pong: {new Date(session.ping_pong.lastPongReceived).toLocaleTimeString()}
                      </Text>
                    )}
                    <Text>Ping interval: {Math.round((session.ping_pong.pingIntervalMs || 0) / 1000)}s</Text>
                    {session.ping_pong.missedPongs > 0 && (
                      <Text color="$red11" fontWeight="600">
                        {session.ping_pong.missedPongs}/{session.ping_pong.maxMissedPongs} missed
                      </Text>
                    )}
                  </XStack>
                )}
              </Alert>
            )}
          </>
        )}

        <Text fontSize="$2" color="$gray11" marginBottom="$1" margin={0}>
          {runtime ? `${runtimeLabel}: ${runtime}` : `${runtimeLabel}: N/A`}
        </Text>
        {isRealtime && (
          <Text
            fontSize="$2"
            color="$gray11"
            fontFamily="$mono"
            marginBottom="$1"
            margin={0}
          >
            {session.session_id === 'pending' ||
            (session.status === 'closed' &&
              session.metadata?.created_at &&
              new Date().getTime() - new Date(session.metadata.created_at).getTime() < 60000) ? (
              <Text fontStyle="italic" color="$gray5">Pending activation</Text>
            ) : (
              <>Session: {session.session_id.substring(0, 20)}...</>
            )}
          </Text>
        )}
        <Text fontSize="$2" color="$gray11" margin={0}>
          Model: {session.metadata.model || 'N/A'}
        </Text>
        {session.metrics_recorded_at && (
          <Text
            fontSize="$1"
            color="$gray5"
            fontStyle="italic"
            margin={0}
          >
            Metrics recorded at: {new Date(session.metrics_recorded_at).toLocaleString()}
          </Text>
        )}
      </YStack>

      {/* Token Metrics */}
      {session.token_metrics && (
        <YStack
          marginBottom="$4"
          paddingBottom="$4"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$3"
            margin={0}
          >
            Token Metrics
          </Text>
          <XStack
            flexWrap="wrap"
            gap="$3"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            <YStack flex={1} minWidth={100}>
              <Text fontSize="$1" color="$gray5" marginBottom="$1" margin={0}>Total</Text>
              <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                {session.token_metrics.total_tokens.toLocaleString()}
              </Text>
            </YStack>
            <YStack flex={1} minWidth={100}>
              <Text fontSize="$1" color="$gray5" marginBottom="$1" margin={0}>Avg</Text>
              <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                {session.token_metrics.avg_tokens.toLocaleString()}
              </Text>
            </YStack>
            <YStack flex={1} minWidth={100}>
              <Text fontSize="$1" color="$gray5" marginBottom="$1" margin={0}>Max</Text>
              <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                {session.token_metrics.max_tokens.toLocaleString()}
              </Text>
            </YStack>
            <YStack flex={1} minWidth={100}>
              <Text fontSize="$1" color="$gray5" marginBottom="$1" margin={0}>Requests</Text>
              <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                {session.token_metrics.request_count}
              </Text>
            </YStack>
          </XStack>
          {(session.token_metrics.warnings > 0 || session.token_metrics.criticals > 0) && (
            <Alert
              variant={session.token_metrics.criticals > 0 ? 'error' : 'warning'}
              marginTop="$3"
            >
              <Text fontSize="$2" margin={0}>
                {session.token_metrics.criticals > 0 && `⚠️ ${session.token_metrics.criticals} critical threshold breaches`}
                {session.token_metrics.criticals > 0 && session.token_metrics.warnings > 0 && ' • '}
                {session.token_metrics.warnings > 0 && `⚠️ ${session.token_metrics.warnings} warnings`}
              </Text>
            </Alert>
          )}
          {session.agent_type === 'facts' && session.token_metrics.facts_budget && (
            <Card variant="outlined" backgroundColor="$gray1" padding="$3" marginTop="$3">
              <Text
                fontSize="$2"
                fontWeight="600"
                color="$gray9"
                textTransform="uppercase"
                letterSpacing={0.5}
                marginBottom="$2"
                margin={0}
              >
                Facts Prompt Budget (last run)
              </Text>
              <XStack
                flexWrap="wrap"
                gap="$2.5"
                $sm={{ flexDirection: 'column' }}
                $md={{ flexDirection: 'row' }}
              >
                <YStack flex={1} minWidth={120}>
                  <Text fontSize="$1" color="$gray5" marginBottom="$0.5" margin={0}>Selected Facts</Text>
                  <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
                    {session.token_metrics.facts_budget.selected} / {session.token_metrics.facts_budget.total_facts}
                  </Text>
                </YStack>
                <YStack flex={1} minWidth={120}>
                  <Text fontSize="$1" color="$gray5" marginBottom="$0.5" margin={0}>Overflow Facts</Text>
                  <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
                    {session.token_metrics.facts_budget.overflow}
                  </Text>
                </YStack>
                <YStack flex={1} minWidth={120}>
                  <Text fontSize="$1" color="$gray5" marginBottom="$0.5" margin={0}>Summaries Added</Text>
                  <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
                    {session.token_metrics.facts_budget.summary}
                  </Text>
                </YStack>
                <YStack flex={1} minWidth={120}>
                  <Text fontSize="$1" color="$gray5" marginBottom="$0.5" margin={0}>Tokens Used / Budget</Text>
                  <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
                    {session.token_metrics.facts_budget.used_tokens} / {session.token_metrics.facts_budget.budget_tokens}
                  </Text>
                </YStack>
              </XStack>
              <Text fontSize="$1" color="$gray11" marginTop="$2" margin={0}>
                Selection Ratio:{' '}
                {(session.token_metrics.facts_budget.selection_ratio * 100).toFixed(1)}%
              </Text>
              <Text fontSize="$1" color="$gray11" marginTop="$1" margin={0}>
                Merged Clusters: {session.token_metrics.facts_budget.merged_clusters}
              </Text>
              {session.token_metrics.facts_budget.merged_facts.length > 0 && (
                <YStack marginTop="$2.5">
                  <Text fontSize="$1" color="$gray5" marginBottom="$1" margin={0}>
                    Merged Facts
                  </Text>
                  <YStack gap="$1" paddingLeft="$4">
                    {session.token_metrics.facts_budget.merged_facts.slice(0, 5).map((merged, idx) => (
                      <Text key={`${merged.representative}-${idx}`} fontSize="$2" color="$gray9" margin={0}>
                        <Text fontWeight="600">{merged.representative}</Text>
                        {merged.members.length > 0 && (
                          <Text opacity={0.8}>
                            {' '}
                            ← {merged.members.join(', ')}
                          </Text>
                        )}
                      </Text>
                    ))}
                  </YStack>
                  {session.token_metrics.facts_budget.merged_facts.length > 5 && (
                    <Text fontSize="$1" color="$gray5" marginTop="$1" margin={0}>
                      +{session.token_metrics.facts_budget.merged_facts.length - 5} additional merges
                    </Text>
                  )}
                </YStack>
              )}
            </Card>
          )}
        </YStack>
      )}

      {/* Recent Logs */}
      {session.recent_logs && session.recent_logs.length > 0 && (
        <YStack>
          <Button
            variant="ghost"
            width="100%"
            justifyContent="space-between"
            padding="$2 $3"
            onPress={() => setExpandedLogs(prev => ({ ...prev, [session.agent_type]: !prev[session.agent_type] }))}
          >
            <Text fontSize="$2" fontWeight="500" color="$gray11" margin={0}>
              Recent Logs ({session.recent_logs.length})
            </Text>
            <Text fontSize="$3" margin={0}>
              {expandedLogs[session.agent_type] ? '▼' : '▶'}
            </Text>
          </Button>
          {expandedLogs[session.agent_type] && (
            <YStack
              marginTop="$3"
              maxHeight={300}
              overflowY="auto"
              padding="$3"
              backgroundColor="$gray1"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$borderColor"
            >
              {session.recent_logs.slice(-20).reverse().map((log, idx) => (
                <YStack
                  key={idx}
                  padding="$2"
                  marginBottom="$2"
                  backgroundColor="$background"
                  borderRadius="$1"
                  borderLeftWidth={3}
                  borderLeftColor={
                    log.level === 'error' ? '$red11' :
                    log.level === 'warn' ? '$yellow11' : '$blue11'
                  }
                >
                  <Text fontSize="$1" color="$gray11" marginBottom="$1" margin={0}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                    {(() => {
                      const seqEntry = log.context?.find(
                        (entry) => entry.key === 'seq' && typeof entry.value === 'number'
                      );
                      return seqEntry ? ` • Seq ${seqEntry.value}` : null;
                    })()}
                  </Text>
                  <Text
                    fontSize="$2"
                    color="$color"
                    fontFamily="$mono"
                    whiteSpace="pre-wrap"
                    style={{ wordBreak: 'break-word' }}
                    margin={0}
                  >
                    {log.message}
                  </Text>
                </YStack>
              ))}
            </YStack>
          )}
        </YStack>
      )}

      {/* Metadata */}
      <YStack
        marginTop="$4"
        paddingTop="$4"
        borderTopWidth={1}
        borderTopColor="$borderColor"
      >
        <Text fontSize="$1" color="$gray5" margin={0}>
          Created: {formatDate(session.metadata.created_at)}
        </Text>
        <Text fontSize="$1" color="$gray5" margin={0}>
          Updated: {formatDate(session.metadata.updated_at)}
        </Text>
        {session.metadata.closed_at && (
          <Text fontSize="$1" color="$gray5" margin={0}>
            Closed: {formatDate(session.metadata.closed_at)}
          </Text>
        )}
      </YStack>

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
    </Card>
  );
}
