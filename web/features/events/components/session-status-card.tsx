'use client';

import React, { useState, useEffect, memo } from 'react';
import {
  YStack,
  XStack,
  Card,
  Alert,
  Heading,
  Body,
  Label,
  Caption,
  Badge,
} from '@jarvis/ui-core';
import type { AgentSessionDisplay } from './agent-sessions-utils';
import { getSessionStatusColor, getSessionStatusColorHex, getSessionStatusLabel, formatDate, formatDuration } from './agent-sessions-utils';
import { styled } from 'tamagui';
import { ClientDateFormatter } from '@/shared/components/client-date-formatter';

interface SessionStatusCardProps {
  title: string;
  session: AgentSessionDisplay;
}

const ConnectionDot = styled(YStack, {
  width: 8,
  height: 8,
  borderRadius: '$10',
});

export const SessionStatusCard = memo(function SessionStatusCard({ title, session }: SessionStatusCardProps) {
  // Initialize with null to avoid hydration mismatch, set in useEffect
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const logsContainerRef = React.useRef<any>(null);
  const prevLogCountRef = React.useRef<number>(0);

  const actualWebSocketState = session.websocket_state;
  const isWebSocketLive = actualWebSocketState === 'OPEN';

  const shouldTick = isWebSocketLive && !session.runtime_stats?.uptime_ms;

  // Set initial time on mount (client-only)
  useEffect(() => {
    setIsMounted(true);
    setCurrentTime(Date.now());
  }, []);

  useEffect(() => {
    if (!shouldTick || !session.metadata.created_at || !isMounted) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [shouldTick, session.metadata.created_at, isMounted]);

  // Auto-scroll to top when new logs arrive (newest logs are at the top)
  useEffect(() => {
    const currentLogCount = session.recent_logs?.length ?? 0;
    if (
      logsContainerRef.current &&
      currentLogCount > 0 &&
      currentLogCount > prevLogCountRef.current
    ) {
      logsContainerRef.current.scrollTop = 0;
    }
    prevLogCountRef.current = currentLogCount;
  }, [session.recent_logs?.length]);

  const statusColor = getSessionStatusColor(session.status);
  const statusColorHex = getSessionStatusColorHex(session.status);
  const statusLabel = getSessionStatusLabel(session.status);
  const agentType = session.agent_type;
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
    // Use currentTime if available (client-side), otherwise fallback to false to avoid hydration mismatch
    const nowMs = isMounted && currentTime !== null ? currentTime : null;
    const isNewClosed = session.status === 'closed' && session.metadata?.created_at && nowMs !== null &&
      (nowMs - new Date(session.metadata.created_at).getTime()) < 60000;
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
      // Use currentTime if available, otherwise use metrics timestamp to avoid hydration mismatch
      const nowMs = isMounted && currentTime !== null ? currentTime : metricsRecordedAtMs;
      const elapsedSinceMetrics = nowMs - metricsRecordedAtMs;
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
        // Only use currentTime if mounted and available, otherwise use updated_at
        return (isMounted && currentTime !== null) ? currentTime : (session.metadata.updated_at ? new Date(session.metadata.updated_at).getTime() : null);
      }
      if (session.metadata.closed_at) {
        return new Date(session.metadata.closed_at).getTime();
      }
      if (session.metadata.updated_at) {
        return new Date(session.metadata.updated_at).getTime();
      }
      // Fallback to updated_at if currentTime not available
      return session.metadata.updated_at ? new Date(session.metadata.updated_at).getTime() : null;
    })();

    if (endTimestampMs === null) {
      return null;
    }
    const diffMs = endTimestampMs - startTimestampMs;
    return diffMs >= 0 ? diffMs : null;
  })();

  const runtime = runtimeMs !== null && runtimeMs !== undefined ? formatDuration(runtimeMs) : null;

  const pingPongMissed = session.ping_pong?.missedPongs ?? 0;
  const pingPongVariant = pingPongMissed === 0 ? 'success' : pingPongMissed === 1 ? 'warning' : 'error';

  // Use white text for statuses with colored backgrounds for better contrast
  const badgeTextColor = session.status === 'closed' || session.status === 'active' || session.status === 'error' ? '#ffffff' : statusColor;

  return (
    <Card variant="outlined" padding="$4" gap={0} width="100%">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center" marginBottom="$1">
        <Heading level={4}>{title}</Heading>
        <Badge backgroundColor={statusColorHex} color={badgeTextColor}>
          {statusLabel}
        </Badge>
      </XStack>

      {/* Connection Status & Runtime */}
      <YStack borderBottomWidth={1} borderBottomColor="$borderColor" paddingBottom="$3" marginTop={0}>
        {isRealtime && (
          <>
            <XStack
              alignItems="center"
              gap="$2"
              marginBottom="$2"
            >
              <ConnectionDot
                backgroundColor={connectionColor}
                opacity={isWebSocketLive ? 1 : 0.4}
              />
              <Caption fontWeight="500" color={connectionColorToken} transform="uppercase">
                WebSocket: {connectionStatus}
                {actualWebSocketState ? (
                  <>
                    {' '}
                    ({actualWebSocketState})
                  </>
                ) : null}
              </Caption>
            </XStack>

            {actualWebSocketState === 'OPEN' && (
              <Alert
                variant={pingPongVariant}
                marginTop="$2"
                marginBottom="$2"
                paddingBottom="$2"
              >
                <XStack
                  alignItems="center"
                  justifyContent="space-between"
                  marginBottom="$1"
                >
                  <Label size="xs">Connection Health</Label>
                  <XStack alignItems="center" gap="$1">
                    {pingPongMissed === 0 && (
                      <Body size="sm">✓ Healthy</Body>
                    )}
                    {pingPongMissed === 1 && (
                      <Body size="sm" color="$yellow11">
                        ⚠ 1 Missed
                      </Body>
                    )}
                    {pingPongMissed >= 2 && (
                      <Body size="sm" color="$red11">
                        ⚠⚠ {pingPongMissed} Missed
                      </Body>
                    )}
                  </XStack>
                </XStack>
                {session.ping_pong?.enabled && (
                  <XStack gap="$1" flexWrap="wrap">
                    {session.ping_pong.lastPongReceived && (
                      <Caption>
                        Last pong: <ClientDateFormatter date={session.ping_pong.lastPongReceived} format="localeTimeString" />
                      </Caption>
                    )}
                    <Caption>
                      Ping interval: {Math.round((session.ping_pong.pingIntervalMs || 0) / 1000)}s
                    </Caption>
                    {session.ping_pong.missedPongs > 0 && (
                      <Label size="xs" tone="danger">
                        {session.ping_pong.missedPongs}/{session.ping_pong.maxMissedPongs} missed
                      </Label>
                    )}
                  </XStack>
                )}
              </Alert>
            )}
          </>
        )}

        <Caption tone="muted" marginBottom="$1">
          {runtime ? `${runtimeLabel}: ${runtime}` : `${runtimeLabel}: N/A`}
        </Caption>
        {isRealtime && (
          <Caption
            tone="muted"
            marginBottom="$1"
            fontStyle={
              session.session_id === 'pending' ||
              (session.status === 'closed' &&
                session.metadata?.created_at &&
                isMounted &&
                currentTime !== null &&
                currentTime - new Date(session.metadata.created_at).getTime() < 60000)
                ? 'italic'
                : undefined
            }
          >
            {session.session_id === 'pending' ||
            (session.status === 'closed' &&
              session.metadata?.created_at &&
              isMounted &&
              currentTime !== null &&
              currentTime - new Date(session.metadata.created_at).getTime() < 60000)
              ? 'Pending activation'
              : `Session: ${session.session_id.substring(0, 20)}…`}
          </Caption>
        )}
        <Caption tone="muted">
          Model: {session.metadata.model || 'N/A'}
        </Caption>
        {session.metrics_recorded_at && (
          <Caption fontStyle="italic">
            Metrics recorded at: <ClientDateFormatter date={session.metrics_recorded_at} format="localeString" />
          </Caption>
        )}
      </YStack>

      {/* Token Metrics */}
      {session.token_metrics && (
        <YStack
          marginTop="$3"
          marginBottom="$3"
          paddingBottom="$3"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <Label size="xs" marginBottom="$2">Token Metrics</Label>
          <XStack
            flexWrap="wrap"
            gap="$3"
            $sm={{ flexDirection: 'column' }}
            $md={{ flexDirection: 'row' }}
          >
            {[
              { label: 'Total', value: session.token_metrics.total_tokens.toLocaleString() },
              { label: 'Avg', value: session.token_metrics.avg_tokens.toLocaleString() },
              { label: 'Max', value: session.token_metrics.max_tokens.toLocaleString() },
              { label: 'Requests', value: session.token_metrics.request_count.toLocaleString() },
              ...(session.token_metrics.image_generation_cost && session.token_metrics.image_generation_cost > 0 ? [
                { label: 'Image Gen Cost', value: `$${session.token_metrics.image_generation_cost.toFixed(4)}` },
                { label: 'Image Gen Count', value: (session.token_metrics.image_generation_count || 0).toLocaleString() },
              ] : []),
            ].map((metric, index) => (
              <YStack key={metric.label} flex={1} minWidth={100}>
                <Label size="xs">{metric.label}</Label>
                <Body size="md" weight="medium">
                  {metric.value}
                </Body>
              </YStack>
            ))}
          </XStack>
          {(session.token_metrics.warnings > 0 || session.token_metrics.criticals > 0) && (
            <Alert
              variant={session.token_metrics.criticals > 0 ? 'error' : 'warning'}
              marginTop="$3"
            >
              <Body size="sm">
                {session.token_metrics.criticals > 0 && `⚠️ ${session.token_metrics.criticals} critical threshold breaches`}
                {session.token_metrics.criticals > 0 && session.token_metrics.warnings > 0 && ' • '}
                {session.token_metrics.warnings > 0 && `⚠️ ${session.token_metrics.warnings} warnings`}
              </Body>
            </Alert>
          )}
          {session.agent_type === 'facts' && session.token_metrics.facts_budget && (
            <Card variant="outlined" backgroundColor="$gray1" padding="$3" marginTop="$3">
              <Label size="xs">Facts Prompt Budget (last run)</Label>
              <XStack
                flexWrap="wrap"
                gap="$2.5"
                $sm={{ flexDirection: 'column' }}
                $md={{ flexDirection: 'row' }}
              >
                <YStack flex={1} minWidth={120}>
                  <Label size="xs">Selected Facts</Label>
                  <Body size="md" weight="medium">
                    {session.token_metrics.facts_budget.selected} / {session.token_metrics.facts_budget.total_facts}
                  </Body>
                </YStack>
                <YStack flex={1} minWidth={120}>
                  <Label size="xs">Overflow Facts</Label>
                  <Body size="md" weight="medium">
                    {session.token_metrics.facts_budget.overflow}
                  </Body>
                </YStack>
                <YStack flex={1} minWidth={120}>
                  <Label size="xs">Summaries Added</Label>
                  <Body size="md" weight="medium">
                    {session.token_metrics.facts_budget.summary}
                  </Body>
                </YStack>
                <YStack flex={1} minWidth={120}>
                  <Label size="xs">Tokens Used / Budget</Label>
                  <Body size="md" weight="medium">
                    {session.token_metrics.facts_budget.used_tokens} / {session.token_metrics.facts_budget.budget_tokens}
                  </Body>
                </YStack>
              </XStack>
              <Caption marginTop="$2">
                Selection Ratio:{' '}
                {(session.token_metrics.facts_budget.selection_ratio * 100).toFixed(1)}%
              </Caption>
              <Caption>
                Merged Clusters: {session.token_metrics.facts_budget.merged_clusters}
              </Caption>
              {session.token_metrics.facts_budget.merged_facts.length > 0 && (
                <YStack marginTop="$2.5">
                  <Label size="xs">Merged Facts</Label>
                  <YStack gap="$1" paddingLeft="$4">
                    {session.token_metrics.facts_budget.merged_facts.slice(0, 5).map((merged, idx) => (
                      <Body key={`${merged.representative}-${idx}`} tone="muted">
                        <Body weight="medium">{merged.representative}</Body>
                        {merged.members.length > 0 && (
                          <Body tone="muted">
                            {' '}
                            ← {merged.members.join(', ')}
                          </Body>
                        )}
                      </Body>
                    ))}
                  </YStack>
                  {session.token_metrics.facts_budget.merged_facts.length > 5 && (
                    <Caption marginTop="$1">
                      +{session.token_metrics.facts_budget.merged_facts.length - 5} additional merges
                    </Caption>
                  )}
                </YStack>
              )}
            </Card>
          )}
        </YStack>
      )}

      {/* Recent Logs */}
      {session.recent_logs && session.recent_logs.length > 0 && (
        <YStack marginTop="$3">
          <Label size="xs" marginBottom="$2">
            Recent Logs ({session.recent_logs.length})
          </Label>
          <YStack
            ref={logsContainerRef}
            maxHeight={300}
            overflow="scroll"
            padding="$3"
            backgroundColor="$gray1"
            borderRadius="$3"
            borderWidth={1}
            borderColor="$borderColor"
            gap="$2"
          >
            {session.recent_logs.slice(-20).reverse().map((log, idx) => (
              <YStack
                key={idx}
                padding="$2"
                backgroundColor="$background"
                borderRadius="$1"
                borderLeftWidth={3}
                borderLeftColor={
                  log.level === 'error'
                    ? '$red11'
                    : log.level === 'warn'
                    ? '$yellow11'
                    : '$blue11'
                }
              >
                <Caption marginBottom="$1">
                  <ClientDateFormatter date={log.timestamp} format="localeTimeString" />
                  {(() => {
                    const seqEntry = log.context?.find(
                      (entry) => entry.key === 'seq' && typeof entry.value === 'number'
                    );
                    return seqEntry ? ` • Seq ${seqEntry.value}` : null;
                  })()}
                </Caption>
                <Body size="sm" mono whitespace="preWrap">
                  {log.message}
                </Body>
              </YStack>
            ))}
          </YStack>
        </YStack>
      )}

      {/* Metadata */}
      <YStack
        marginTop="$3"
        paddingTop="$3"
        borderTopWidth={1}
        borderTopColor="$borderColor"
      >
        <Caption>
          Created: {formatDate(session.metadata.created_at)}
        </Caption>
        <Caption>
          Updated: {formatDate(session.metadata.updated_at)}
        </Caption>
        {session.metadata.closed_at && (
          <Caption>
            Closed: {formatDate(session.metadata.closed_at)}
          </Caption>
        )}
      </YStack>

    </Card>
  );
}, (prevProps, nextProps) => {
  // Only re-render if session data actually changed
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.session.session_id !== nextProps.session.session_id) return false;
  if (prevProps.session.status !== nextProps.session.status) return false;
  if (prevProps.session.websocket_state !== nextProps.session.websocket_state) return false;
  
  // Deep compare token_metrics and runtime_stats (these are large objects)
  const prevMetrics = prevProps.session.token_metrics;
  const nextMetrics = nextProps.session.token_metrics;
  if (prevMetrics?.total_tokens !== nextMetrics?.total_tokens) return false;
  if (prevMetrics?.request_count !== nextMetrics?.request_count) return false;
  
  const prevStats = prevProps.session.runtime_stats;
  const nextStats = nextProps.session.runtime_stats;
  if (prevStats?.uptime_ms !== nextStats?.uptime_ms) return false;
  if (prevStats?.cards_last_seq !== nextStats?.cards_last_seq) return false;
  
  // If all key fields are the same, skip re-render
  return true;
});
