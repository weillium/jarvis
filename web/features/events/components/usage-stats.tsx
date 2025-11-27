'use client';

import { useState, useMemo } from 'react';
import { useAgentSessionsHistoryQuery } from '@/shared/hooks/use-agent-sessions-history-query';
import { calculateOpenAICost } from '@/shared/utils/pricing';
import type { AgentSessionDisplay, AgentType } from './agent-sessions-utils';
import { agentTitles, defaultAgentModels, inferPromptShareFromMetrics, formatDate } from './agent-sessions-utils';
import type { AgentSessionHistory } from '@/shared/hooks/use-agent-sessions-history-query';
import {
  YStack,
  XStack,
  Text,
  Card,
  Button,
  Input,
  Alert,
  Select,
  Body,
  Label,
  Caption,
  EmptyStateCard,
  LoadingState,
  Toolbar,
} from '@jarvis/ui-core';
import { ClientDateFormatter } from '@/shared/components/client-date-formatter';

interface UsageStatsProps {
  eventId: string;
  embedded?: boolean;
}

interface GroupedSession {
  agent_id: string;
  agent_type: AgentType;
  transport: 'realtime' | 'stateless';
  records: AgentSessionHistory[];
  aggregatedStats: {
    totalTokens: number;
    totalRequests: number;
    maxTokens: number;
    avgTokens: number;
    totalCost: number;
    imageGenerationCost: number;
    imageGenerationCount: number;
    model?: string;
  };
}

const getEventTypeLabel = (eventType: string): string => {
  switch (eventType) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'paused':
      return 'Paused';
    case 'resumed':
      return 'Resumed';
    case 'error':
      return 'Error';
    case 'closed':
      return 'Closed';
    default:
      return eventType;
  }
};

const getEventTypeColor = (eventType: string): string => {
  switch (eventType) {
    case 'connected':
    case 'resumed':
      return '$green11';
    case 'disconnected':
    case 'paused':
      return '$yellow11';
    case 'error':
      return '$red11';
    case 'closed':
      return '$gray11';
    default:
      return '$gray11';
  }
};

const getStatusColor = (status: string): string => {
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

export function UsageStats({ eventId, embedded = false }: UsageStatsProps) {
  const { data: historyData, isLoading, refetch } = useAgentSessionsHistoryQuery(eventId);
  const records: AgentSessionHistory[] = historyData?.records || [];
  const [isExpanded, setIsExpanded] = useState(embedded);
  const [filterByAgent, setFilterByAgent] = useState<string | null>(null);
  const [filterByTransport, setFilterByTransport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsageStats = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (err) {
      console.error('Failed to fetch usage stats:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Group records by agent_id × agent_type
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, GroupedSession>();

    for (const record of records) {
      const key = `${record.agent_id}-${record.agent_type}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          agent_id: record.agent_id,
          agent_type: record.agent_type,
          transport: record.transport,
          records: [],
          aggregatedStats: {
            totalTokens: 0,
            totalRequests: 0,
            maxTokens: 0,
            avgTokens: 0,
            totalCost: 0,
            imageGenerationCost: 0,
            imageGenerationCount: 0,
          },
        });
      }

      const group = groups.get(key)!;
      group.records.push(record);
    }

    // Sort records by history_created_at (newest first for timeline)
    for (const group of groups.values()) {
      group.records.sort((a, b) => 
        new Date(b.history_created_at).getTime() - new Date(a.history_created_at).getTime()
      );
    }

    // Aggregate stats for each group
    for (const group of groups.values()) {
      let totalTokens = 0;
      let totalRequests = 0;
      let maxTokens = 0;
      let totalCost = 0;
      let imageGenerationCost = 0;
      let imageGenerationCount = 0;
      let model: string | undefined;

      for (const record of group.records) {
        if (record.token_metrics) {
          const tokens = record.token_metrics.total_tokens || 0;
          const requests = record.token_metrics.request_count || 0;
          
          totalTokens += tokens;
          totalRequests += requests;
          maxTokens = Math.max(maxTokens, tokens);

          if (!model && record.metadata.model) {
            model = record.metadata.model;
          }

          // Calculate cost for this record
          const modelKey = record.metadata.model || defaultAgentModels[record.agent_type];
          const promptShare = inferPromptShareFromMetrics(record.token_metrics);
          const promptTokens = Math.round(tokens * promptShare);
          const completionTokens = Math.max(tokens - promptTokens, 0);

          const cost = calculateOpenAICost(
            {
              total_tokens: tokens,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
            },
            modelKey,
            false
          );
          totalCost += cost;

          // Add image generation costs
          if (record.token_metrics.image_generation_cost) {
            imageGenerationCost += record.token_metrics.image_generation_cost;
            totalCost += record.token_metrics.image_generation_cost;
          }
          if (record.token_metrics.image_generation_count) {
            imageGenerationCount += record.token_metrics.image_generation_count;
          }
        }
      }

      group.aggregatedStats = {
        totalTokens,
        totalRequests,
        maxTokens,
        avgTokens: totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0,
        totalCost,
        imageGenerationCost,
        imageGenerationCount,
        model,
      };
    }

    return Array.from(groups.values());
  }, [records]);

  const filteredGroups = groupedSessions
    .filter((group) => {
      if (filterByAgent && group.agent_type !== filterByAgent) return false;
      if (filterByTransport && group.transport !== filterByTransport) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          group.agent_type.toLowerCase().includes(query) ||
          group.transport.toLowerCase().includes(query) ||
          agentTitles[group.agent_type].toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Order: transcript, facts, cards
      const order: Record<AgentType, number> = {
        transcript: 0,
        facts: 1,
        cards: 2,
      };
      return (order[a.agent_type] ?? 999) - (order[b.agent_type] ?? 999);
    });

  const uniqueAgents = Array.from(new Set(groupedSessions.map((g) => g.agent_type))).sort();
  const uniqueTransports = Array.from(new Set(groupedSessions.map((g) => g.transport))).sort();

  if (isLoading) {
    return (
      <YStack padding="$8">
        <LoadingState
          title="Loading usage stats"
          description="Fetching saved historical agent session data."
        />
      </YStack>
    );
  }

  if (!records || records.length === 0) {
    return (
      <YStack padding="$8">
        <EmptyStateCard
          title="No historical usage stats available"
          description="Historical agent session records will appear here once sessions are created and run."
          padding="$6"
          titleLevel={5}
        />
      </YStack>
    );
  }

  if (embedded) {
    return (
      <YStack padding="$8">
        {/* Search and Filters */}
        {isExpanded && (uniqueAgents.length > 0 || uniqueTransports.length > 0) && (
          <Toolbar marginBottom="$3">
            <Toolbar.Item flex={1}>
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e: any) => setSearchQuery(e.target.value)}
                width="100%"
              />
            </Toolbar.Item>
            {uniqueAgents.length > 0 && (
              <Toolbar.Item flex={0} minWidth={150}>
                <Select value={filterByAgent || ''} onChange={(e) => setFilterByAgent(e.target.value || null)}>
                  <option value="">All Agents</option>
                  {uniqueAgents.map((agent) => (
                    <option key={agent} value={agent}>
                      {agentTitles[agent as AgentType]}
                    </option>
                  ))}
                </Select>
              </Toolbar.Item>
            )}
            {uniqueTransports.length > 0 && (
              <Toolbar.Item flex={0} minWidth={150}>
                <Select value={filterByTransport || ''} onChange={(e) => setFilterByTransport(e.target.value || null)}>
                  <option value="">All Types</option>
                  {uniqueTransports.map((transport) => (
                    <option key={transport} value={transport}>
                      {transport === 'realtime' ? 'Realtime' : 'Stateless'}
                    </option>
                  ))}
                </Select>
              </Toolbar.Item>
            )}
            <Toolbar.Item flex={0}>
              <Button variant="outline" size="sm" onClick={fetchUsageStats} disabled={refreshing}>
                <XStack alignItems="center" gap="$1">
                  <Text margin={0}>↻</Text>
                  <Text margin={0}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
                </XStack>
              </Button>
            </Toolbar.Item>
            {(filterByAgent || filterByTransport || searchQuery) && (
              <Toolbar.Item flex={0}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterByAgent(null);
                    setFilterByTransport(null);
                    setSearchQuery('');
                  }}
                >
                  <Text margin={0}>Clear Filters</Text>
                </Button>
              </Toolbar.Item>
            )}
          </Toolbar>
        )}

        {/* Grouped Sessions */}
        {isExpanded && (
          <YStack gap="$4">
            {filteredGroups.length === 0 ? (
              <EmptyStateCard
                title="No sessions match"
                description="Adjust or clear your filters to view usage stats."
                padding="$6"
                titleLevel={5}
              />
            ) : (
              filteredGroups.map((group) => (
                <Card
                  key={`${group.agent_id}-${group.agent_type}`}
                  variant="outlined"
                  padding="$5"
                  backgroundColor="$background"
                >
                  {/* Header */}
                  <XStack justifyContent="space-between" alignItems="center" marginBottom="$4">
                    <XStack alignItems="center" gap="$2">
                      <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                        {agentTitles[group.agent_type]}
                      </Text>
                      <YStack
                        padding="$0.5 $2"
                        backgroundColor="$gray2"
                        borderRadius="$1"
                      >
                        <Text fontSize="$1" color="$gray11" margin={0}>
                          {group.transport === 'realtime' ? 'Realtime' : 'Stateless'}
                        </Text>
                      </YStack>
                    </XStack>
                    {group.aggregatedStats.totalCost > 0 && (
                      <YStack
                        paddingVertical="$1"
                        paddingHorizontal="$2"
                        backgroundColor="$green2"
                        borderRadius="$1"
                        borderWidth={1}
                        borderColor="$green3"
                      >
                        <Text fontSize="$2" fontWeight="600" color="$green11" margin={0}>
                          ${group.aggregatedStats.totalCost.toFixed(4)}
                        </Text>
                      </YStack>
                    )}
                  </XStack>

                  {/* Aggregated Stats */}
                  {group.aggregatedStats.totalTokens > 0 && (
                    <YStack marginBottom="$4" padding="$3" backgroundColor="$gray1" borderRadius="$2" borderWidth={1} borderColor="$borderColor">
                      <Label size="xs" marginBottom="$2">Aggregated Usage Stats</Label>
                      <XStack flexWrap="wrap" gap="$3" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }}>
                        {[
                          { label: 'Total Tokens', value: group.aggregatedStats.totalTokens.toLocaleString() },
                          { label: 'Total Requests', value: group.aggregatedStats.totalRequests.toLocaleString() },
                          { label: 'Avg Tokens', value: group.aggregatedStats.avgTokens.toLocaleString() },
                          { label: 'Max Tokens', value: group.aggregatedStats.maxTokens.toLocaleString() },
                          { label: 'Total Cost', value: `$${group.aggregatedStats.totalCost.toFixed(4)}` },
                          ...(group.aggregatedStats.imageGenerationCost > 0 ? [
                            { label: 'Image Gen Cost', value: `$${group.aggregatedStats.imageGenerationCost.toFixed(4)}` },
                            { label: 'Image Gen Count', value: group.aggregatedStats.imageGenerationCount.toLocaleString() },
                          ] : []),
                          ...(group.aggregatedStats.model ? [{ label: 'Model', value: group.aggregatedStats.model }] : []),
                        ].map((stat) => (
                          <YStack key={stat.label} flex={1} minWidth={120}>
                            <Label size="xs">{stat.label}</Label>
                            <Body size="md" weight="medium">
                              {stat.value}
                            </Body>
                          </YStack>
                        ))}
                      </XStack>
                    </YStack>
                  )}

                  {/* Timeline */}
                  <YStack>
                    <Label size="xs" marginBottom="$2">Event Timeline</Label>
                    <YStack
                      maxHeight={400}
                      overflow="scroll"
                      padding="$3"
                      backgroundColor="$gray1"
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor="$borderColor"
                      gap="$2"
                    >
                      {group.records.length === 0 ? (
                        <Caption tone="muted">No history records</Caption>
                      ) : (
                        group.records.map((record, idx) => (
                          <XStack
                            key={record.history_id}
                            gap="$3"
                            padding="$2"
                            backgroundColor="$background"
                            borderRadius="$1"
                            borderLeftWidth={3}
                            borderLeftColor={getEventTypeColor(record.event_type)}
                          >
                            <YStack flex={1} minWidth={0}>
                              <XStack alignItems="center" gap="$2" marginBottom="$1">
                                <Body size="sm" weight="medium" color={getEventTypeColor(record.event_type)}>
                                  {getEventTypeLabel(record.event_type)}
                                </Body>
                                {record.status && (
                                  <YStack
                                    paddingVertical="$0.5"
                                    paddingHorizontal="$1.5"
                                    backgroundColor={getStatusColor(record.status)}
                                    borderRadius="$1"
                                  >
                                    <Body
                                      size="xs"
                                      weight="medium"
                                      color="#ffffff"
                                      transform="uppercase"
                                      margin={0}
                                    >
                                      {record.status}
                                    </Body>
                                  </YStack>
                                )}
                              </XStack>
                              <Caption>
                                <ClientDateFormatter date={record.history_created_at} format="localeString" />
                              </Caption>
                              {record.previous_status && record.new_status && (
                                <Caption tone="muted" marginTop="$1">
                                  {record.previous_status} → {record.new_status}
                                </Caption>
                              )}
                              {record.token_metrics && (
                                <Caption tone="muted" marginTop="$1">
                                  {(() => {
                                    const modelKey = record.metadata.model || defaultAgentModels[record.agent_type];
                                    const promptShare = inferPromptShareFromMetrics(record.token_metrics);
                                    const promptTokens = Math.round(record.token_metrics.total_tokens * promptShare);
                                    const completionTokens = Math.max(record.token_metrics.total_tokens - promptTokens, 0);
                                    const cost = calculateOpenAICost(
                                      {
                                        total_tokens: record.token_metrics.total_tokens,
                                        prompt_tokens: promptTokens,
                                        completion_tokens: completionTokens,
                                      },
                                      modelKey,
                                      false
                                    );
                                    return `${record.token_metrics.total_tokens.toLocaleString()} tokens · ${record.token_metrics.request_count} requests${cost > 0 ? ` · $${cost.toFixed(4)}` : ''}`;
                                  })()}
                                </Caption>
                              )}
                            </YStack>
                          </XStack>
                        ))
                      )}
                    </YStack>
                  </YStack>
                </Card>
              ))
            )}
          </YStack>
        )}
      </YStack>
    );
  }

  return (
    <Card variant="outlined" padding="$6" marginBottom="$6">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center" marginBottom="$5">
        <YStack>
          <Text fontSize="$5" fontWeight="600" color="$color" marginBottom="$1" margin={0}>
            Usage Stats
          </Text>
          <Text fontSize="$2" color="$gray11" margin={0}>
            {`${groupedSessions.length} ${groupedSessions.length === 1 ? 'agent group' : 'agent groups'}`}
          </Text>
        </YStack>
        <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
          <Text>{isExpanded ? 'Collapse' : 'Expand'}</Text>
        </Button>
      </XStack>

      {/* Search and Filters */}
      {isExpanded && (uniqueAgents.length > 0 || uniqueTransports.length > 0) && (
        <Toolbar marginBottom="$3">
          <Toolbar.Item flex={1}>
            <Input
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              width="100%"
            />
          </Toolbar.Item>
          {uniqueAgents.length > 0 && (
            <Toolbar.Item flex={0} minWidth={150}>
              <Select value={filterByAgent || ''} onChange={(e) => setFilterByAgent(e.target.value || null)}>
                <option value="">All Agents</option>
                {uniqueAgents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agentTitles[agent as AgentType]}
                  </option>
                ))}
              </Select>
            </Toolbar.Item>
          )}
          {uniqueTransports.length > 0 && (
            <Toolbar.Item flex={0} minWidth={150}>
              <Select value={filterByTransport || ''} onChange={(e) => setFilterByTransport(e.target.value || null)}>
                <option value="">All Types</option>
                {uniqueTransports.map((transport) => (
                  <option key={transport} value={transport}>
                    {transport === 'realtime' ? 'Realtime' : 'Stateless'}
                  </option>
                ))}
              </Select>
            </Toolbar.Item>
          )}
          <Toolbar.Item flex={0}>
            <Button variant="outline" size="sm" onClick={fetchUsageStats} disabled={refreshing}>
              <XStack alignItems="center" gap="$1">
                <Text margin={0}>↻</Text>
                <Text margin={0}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
              </XStack>
            </Button>
          </Toolbar.Item>
          {(filterByAgent || filterByTransport || searchQuery) && (
            <Toolbar.Item flex={0}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterByAgent(null);
                  setFilterByTransport(null);
                  setSearchQuery('');
                }}
              >
                <Text margin={0}>Clear Filters</Text>
              </Button>
            </Toolbar.Item>
          )}
        </Toolbar>
      )}

      {/* Grouped Sessions */}
      {isExpanded && (
        <YStack gap="$4">
          {filteredGroups.length === 0 ? (
            <EmptyStateCard
              title="No sessions match"
              description="Adjust or clear your filters to view usage stats."
              padding="$6"
              titleLevel={5}
            />
          ) : (
            filteredGroups.map((group) => (
              <Card
                key={`${group.agent_id}-${group.agent_type}`}
                variant="outlined"
                padding="$5"
                backgroundColor="$background"
              >
                {/* Header */}
                <XStack justifyContent="space-between" alignItems="center" marginBottom="$4" paddingHorizontal="$0">
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                      {agentTitles[group.agent_type]}
                    </Text>
                    <YStack padding="$0.5 $2" backgroundColor="$gray2" borderRadius="$1">
                      <Text fontSize="$1" color="$gray11" margin={0}>
                        {group.transport === 'realtime' ? 'Realtime' : 'Stateless'}
                      </Text>
                    </YStack>
                  </XStack>
                  {group.aggregatedStats.totalCost > 0 && (
                    <YStack
                      paddingVertical="$1"
                      paddingHorizontal="$2"
                      backgroundColor="$green2"
                      borderRadius="$1"
                      borderWidth={1}
                      borderColor="$green3"
                    >
                      <Text fontSize="$2" fontWeight="600" color="$green11" margin={0}>
                        ${group.aggregatedStats.totalCost.toFixed(4)}
                      </Text>
                    </YStack>
                  )}
                </XStack>

                {/* Aggregated Stats */}
                {group.aggregatedStats.totalTokens > 0 && (
                  <YStack marginBottom="$4" padding="$3" backgroundColor="$gray1" borderRadius="$2" borderWidth={1} borderColor="$borderColor">
                    <Label size="xs" marginBottom="$2">Aggregated Usage Stats</Label>
                    <XStack flexWrap="wrap" gap="$3" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }}>
                      {[
                        { label: 'Total Tokens', value: group.aggregatedStats.totalTokens.toLocaleString() },
                        { label: 'Total Requests', value: group.aggregatedStats.totalRequests.toLocaleString() },
                        { label: 'Avg Tokens', value: group.aggregatedStats.avgTokens.toLocaleString() },
                        { label: 'Max Tokens', value: group.aggregatedStats.maxTokens.toLocaleString() },
                        { label: 'Total Cost', value: `$${group.aggregatedStats.totalCost.toFixed(4)}` },
                        ...(group.aggregatedStats.model ? [{ label: 'Model', value: group.aggregatedStats.model }] : []),
                      ].map((stat) => (
                        <YStack key={stat.label} flex={1} minWidth={120}>
                          <Label size="xs">{stat.label}</Label>
                          <Body size="md" weight="medium">
                            {stat.value}
                          </Body>
                        </YStack>
                      ))}
                    </XStack>
                  </YStack>
                )}

                {/* Timeline */}
                <YStack>
                  <Label size="xs" marginBottom="$2">Event Timeline</Label>
                  <YStack
                    maxHeight={400}
                    overflow="scroll"
                    padding="$3"
                    backgroundColor="$gray1"
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor="$borderColor"
                    gap="$2"
                  >
                    {group.records.length === 0 ? (
                      <Caption tone="muted">No history records</Caption>
                    ) : (
                      group.records.map((record) => (
                        <XStack
                          key={record.history_id}
                          gap="$3"
                          padding="$2"
                          backgroundColor="$background"
                          borderRadius="$1"
                          borderLeftWidth={3}
                          borderLeftColor={getEventTypeColor(record.event_type)}
                        >
                          <YStack flex={1} minWidth={0}>
                            <XStack alignItems="center" gap="$2" marginBottom="$1">
                              <Body size="sm" weight="medium" color={getEventTypeColor(record.event_type)}>
                                {getEventTypeLabel(record.event_type)}
                              </Body>
                              {record.status && (
                                <YStack
                                  paddingVertical="$0.5"
                                  paddingHorizontal="$1.5"
                                  backgroundColor={getStatusColor(record.status)}
                                  borderRadius="$1"
                                >
                                  <Body
                                    size="xs"
                                    weight="medium"
                                    color="#ffffff"
                                    transform="uppercase"
                                    margin={0}
                                  >
                                    {record.status}
                                  </Body>
                                </YStack>
                              )}
                            </XStack>
                            <Caption>
                              <ClientDateFormatter date={record.history_created_at} format="localeString" />
                            </Caption>
                            {record.previous_status && record.new_status && (
                              <Caption tone="muted" marginTop="$1">
                                {record.previous_status} → {record.new_status}
                              </Caption>
                            )}
                            {record.token_metrics && (
                              <Caption tone="muted" marginTop="$1">
                                {record.token_metrics.total_tokens.toLocaleString()} tokens · {record.token_metrics.request_count} requests
                                {(() => {
                                  const modelKey = record.metadata.model || defaultAgentModels[record.agent_type];
                                  const promptShare = inferPromptShareFromMetrics(record.token_metrics);
                                  const promptTokens = Math.round(record.token_metrics.total_tokens * promptShare);
                                  const completionTokens = Math.max(record.token_metrics.total_tokens - promptTokens, 0);
                                  const cost = calculateOpenAICost(
                                    {
                                      total_tokens: record.token_metrics.total_tokens,
                                      prompt_tokens: promptTokens,
                                      completion_tokens: completionTokens,
                                    },
                                    modelKey,
                                    false
                                  );
                                  return cost > 0 ? ` · $${cost.toFixed(4)}` : '';
                                })()}
                              </Caption>
                            )}
                          </YStack>
                        </XStack>
                      ))
                    )}
                  </YStack>
                </YStack>
              </Card>
            ))
          )}
        </YStack>
      )}
    </Card>
  );
}
