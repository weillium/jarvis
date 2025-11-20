'use client';

import { useState } from 'react';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
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
  BulletList,
  EmptyStateCard,
  LoadingState,
} from '@jarvis/ui-core';

interface VersionHistoryProps {
  eventId: string;
  embedded?: boolean;
}

interface GenerationCycle {
  id: string;
  cycle_type: string;
  component: string | null;
  status: string;
  progress_current: number;
  progress_total: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  cost?: number | null;
  cost_breakdown?: {
    total: number;
    currency: string;
    breakdown: Record<string, any>;
    pricing_version?: string;
  } | null;
  metadata?: {
    cost?: {
      total: number;
      currency: string;
      breakdown: Record<string, any>;
      pricing_version?: string;
    };
  };
}

const isGenerationCycle = (value: unknown): value is GenerationCycle => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.cycle_type === 'string' &&
    typeof record.status === 'string'
  );
};

export function VersionHistory({ eventId, embedded = false }: VersionHistoryProps) {
  const { data: cyclesData, isLoading, refetch } = useContextVersionsQuery(eventId);
  const cycles: GenerationCycle[] = Array.isArray(cyclesData)
    ? cyclesData.filter(isGenerationCycle)
    : [];
  const [isExpanded, setIsExpanded] = useState(embedded); // Auto-expand when embedded
  const [filterByType, setFilterByType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<string>>(new Set());

  const fetchVersionHistory = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (err) {
      console.error('Failed to fetch version history:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const versionData = cycles.length > 0 ? { cycles, count: cycles.length } : null;
  const loading = isLoading;

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return '$green11';
      case 'processing':
        return '$blue11';
      case 'started':
        return '$yellow11';
      case 'failed':
        return '$red11';
      case 'superseded':
        return '$gray11';
      default:
        return '$gray11';
    }
  };

  const getStatusColorHex = (status: string): string => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'processing':
        return '#3b82f6';
      case 'started':
        return '#f59e0b';
      case 'failed':
        return '#ef4444';
      case 'superseded':
        return '#64748b';
      default:
        return '#64748b';
    }
  };

  const getTypeLabel = (type: string): string => {
    const normalized = type?.trim().toLowerCase();

    switch (normalized) {
      case 'research':
        return 'Research';
      case 'glossary':
        return 'Glossary';
      case 'chunks':
        return 'Chunks';
      case 'full':
        return 'Full Generation';
      case 'blueprint':
        return 'Blueprint';
      default:
        return type;
    }
  };

  const getComponentLabel = (component: string | null): string | null => {
    if (!component) {
      return null;
    }

    const trimmed = component.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.toLowerCase();
    const knownLabels: Record<string, string> = {
      blueprint: 'Blueprint',
      bluepirnt: 'Blueprint',
      'context_blueprint': 'Blueprint',
      'context-blueprint': 'Blueprint',
    };

    if (knownLabels[normalized]) {
      return knownLabels[normalized];
    }

    const titleCased = trimmed
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' ');

    return titleCased || trimmed;
  };

  const filteredCycles = cycles.filter((cycle) => {
    if (filterByType && cycle.cycle_type !== filterByType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesQuery =
        cycle.cycle_type.toLowerCase().includes(query) ||
        (cycle.component?.toLowerCase().includes(query) ?? false) ||
        cycle.status.toLowerCase().includes(query) ||
        (cycle.error_message?.toLowerCase().includes(query) ?? false);
      if (!matchesQuery) return false;
    }
    return true;
  });

  const uniqueTypes = Array.from(new Set(cycles.map((cycle) => cycle.cycle_type))).sort();

  const renderChatCompletions = (
    completions: Array<{
      cost?: number;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }>
  ) => {
    if (!completions || completions.length === 0) {
      return null;
    }

    return (
      <YStack marginTop="$1.5">
        <Label size="xs">Chat Completions</Label>
        <BulletList
          items={completions}
          renderItem={(item) => (
            <Caption>
              {item.model ? `${item.model}` : 'Model unknown'}
              {item.cost !== undefined ? ` · $${item.cost.toFixed(4)}` : null}
              {item.usage
                ? ` · tokens: ${item.usage.total_tokens ?? '-'} (prompt ${item.usage.prompt_tokens ?? '-'}, completion ${item.usage.completion_tokens ?? '-'})`
                : null}
            </Caption>
          )}
        />
      </YStack>
    );
  };

  const renderCostBreakdown = (cycle: GenerationCycle) => {
    if (!cycle.cost_breakdown) {
      return null;
    }

    const isExpanded = expandedBreakdowns.has(cycle.id);
    const breakdown = cycle.cost_breakdown;
    const openaiBreakdown = breakdown.breakdown?.openai;
    const exaBreakdown = breakdown.breakdown?.exa;

    return (
      <YStack marginTop="$3">
        <Button
          variant="ghost"
          size="sm"
          alignSelf="flex-start"
          onClick={() => toggleBreakdown(cycle.id)}
        >
          {isExpanded ? 'Hide Cost Breakdown' : 'Show Cost Breakdown'}
        </Button>
        {isExpanded && (
          <YStack
            marginTop="$2"
            padding="$3"
            backgroundColor="$gray1"
            borderRadius="$2"
            borderWidth={1}
            borderColor="$borderColor"
            gap="$2"
          >
            <Body size="sm">
              <Body size="sm" weight="bold">
                Total:
              </Body>{' '}
              ${breakdown.total?.toFixed(4) ?? '0.0000'} {breakdown.currency || 'USD'}
            </Body>

            {openaiBreakdown && (
              <YStack gap="$1.5">
                <Body size="sm">
                  <Body size="sm" weight="bold">
                    OpenAI:
                  </Body>{' '}
                  $
                  {typeof openaiBreakdown.total === 'number'
                    ? openaiBreakdown.total.toFixed(4)
                    : '0.0000'}
                  {openaiBreakdown.chat_completions?.length
                    ? ` (${openaiBreakdown.chat_completions.length} chat completion${
                        openaiBreakdown.chat_completions.length > 1 ? 's' : ''
                      })`
                    : ''}
                  {openaiBreakdown.embeddings?.length
                    ? ` (${openaiBreakdown.embeddings.length} embedding${
                        openaiBreakdown.embeddings.length > 1 ? 's' : ''
                      })`
                    : ''}
                </Body>
                {renderChatCompletions(openaiBreakdown.chat_completions || [])}
                {openaiBreakdown.embeddings?.length ? (
                  <YStack gap="$1">
                    <Label size="xs">Embeddings</Label>
                    <BulletList
                      items={openaiBreakdown.embeddings}
                      renderItem={(item) => {
                        const embedding = item as { model?: string; cost?: number; usage?: { total_tokens?: number } };
                        return (
                          <Caption>
                            {embedding.model ? `${embedding.model}` : 'Model unknown'}
                            {embedding.cost !== undefined ? ` · $${embedding.cost.toFixed(4)}` : null}
                            {embedding.usage?.total_tokens !== undefined
                              ? ` · tokens: ${embedding.usage.total_tokens}`
                              : null}
                          </Caption>
                        );
                      }}
                    />
                  </YStack>
                ) : null}
              </YStack>
            )}

            {exaBreakdown && (
              <Body size="sm">
                <Body size="sm" weight="bold">
                  Exa:
                </Body>{' '}
                $
                {typeof exaBreakdown.total === 'number'
                  ? exaBreakdown.total.toFixed(4)
                  : '0.0000'}
                {exaBreakdown.search?.queries
                  ? ` (${exaBreakdown.search.queries} search${
                      exaBreakdown.search.queries > 1 ? 'es' : ''
                    })`
                  : ''}
                {exaBreakdown.research?.queries
                  ? ` (${exaBreakdown.research.queries} research task${
                      exaBreakdown.research.queries > 1 ? 's' : ''
                    })`
                  : ''}
                {exaBreakdown.answer?.queries
                  ? ` (${exaBreakdown.answer.queries} answer${
                      exaBreakdown.answer.queries > 1 ? 's' : ''
                    })`
                  : ''}
              </Body>
            )}

            {breakdown.pricing_version && (
              <Caption>
                Pricing version: {breakdown.pricing_version}
              </Caption>
            )}
          </YStack>
        )}
      </YStack>
    );
  };

  const toggleBreakdown = (cycleId: string) => {
    setExpandedBreakdowns((prev) => {
      const next = new Set(prev);
      if (next.has(cycleId)) {
        next.delete(cycleId);
      } else {
        next.add(cycleId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <LoadingState
        title="Loading version history"
        description="Fetching the latest generation cycles."
        align={embedded ? 'start' : 'center'}
        padding="$6"
        skeletons={[{ height: 48 }, { height: 48 }, { height: 48 }]}
        marginBottom={embedded ? '$3' : '$6'}
      />
    );
  }

  if (!versionData || versionData.count === 0) {
    return null; // Don't show if no history
  }

  if (embedded) {
    return (
      <YStack>

      {/* Search and Filters */}
      {isExpanded && uniqueTypes.length > 0 && (
        <XStack
          gap="$3"
          marginBottom="$3"
          flexWrap="wrap"
          alignItems="center"
        >
          <Input
            flex={1}
            minWidth={200}
            placeholder="Search cycles..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVersionHistory}
            disabled={refreshing}
          >
            ↻ {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Select
            value={filterByType || ''}
            onChange={(e) => setFilterByType(e.target.value || null)}
            size="sm"
          >
            <option value="">All Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {getTypeLabel(type)}
              </option>
            ))}
          </Select>
          {(filterByType || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterByType(null);
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </XStack>
      )}

      {/* Cycles List */}
      {isExpanded && (
        <YStack gap="$2">
          {filteredCycles.length === 0 ? (
            <EmptyStateCard
              title="No cycles match"
              description="Adjust or clear your filters to view version history."
              padding="$4"
              borderWidth={0}
              backgroundColor="transparent"
              titleLevel={5}
            />
          ) : (
            filteredCycles.map((cycle) => (
              <Card
                key={cycle.id}
                variant="outlined"
                padding="$4"
                backgroundColor="$background"
                marginBottom="$3"
              >
                <XStack
                  justifyContent="space-between"
                  alignItems="center"
                  marginBottom="$2"
                >
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
                      {getTypeLabel(cycle.cycle_type)}
                    </Text>
                    {(() => {
                      const componentLabel = getComponentLabel(cycle.component);
                      const typeLabel = getTypeLabel(cycle.cycle_type);
                      if (!componentLabel) {
                        return null;
                      }

                      if (componentLabel.toLowerCase() === typeLabel.toLowerCase()) {
                        return null;
                      }

                      return (
                        <YStack
                          padding="$0.5 $2"
                          backgroundColor="$gray2"
                          borderRadius="$1"
                        >
                          <Text fontSize="$1" color="$gray11" margin={0}>
                            {componentLabel}
                          </Text>
                        </YStack>
                      );
                    })()}
                  </XStack>
                  <XStack alignItems="center" gap="$2">
                    {cycle.cost !== null && cycle.cost !== undefined && (
                      <YStack
                        padding="$1 $2"
                        backgroundColor="$green2"
                        borderRadius="$1"
                        borderWidth={1}
                        borderColor="$green3"
                      >
                        <Text fontSize="$2" fontWeight="600" color="$green11" margin={0}>
                          ${cycle.cost.toFixed(4)}
                        </Text>
                      </YStack>
                    )}
                    <YStack
                      padding="$1 $2"
                      backgroundColor={getStatusColorHex(cycle.status)}
                      borderRadius="$1"
                    >
                      <Body
                        size="xs"
                        weight="medium"
                        color="#ffffff"
                        transform="uppercase"
                        margin={0}
                      >
                        {cycle.status}
                      </Body>
                    </YStack>
                  </XStack>
                </XStack>
                <XStack gap="$4" flexWrap="wrap">
                  {cycle.progress_total > 0 && (
                    <Text fontSize="$2" color="$gray11" margin={0}>
                      Progress: {cycle.progress_current} / {cycle.progress_total} (
                      {Math.round((cycle.progress_current / cycle.progress_total) * 100)}%)
                    </Text>
                  )}
                  <Text fontSize="$2" color="$gray11" margin={0}>
                    Started: {new Date(cycle.started_at).toLocaleString()}
                  </Text>
                  {cycle.completed_at && (
                    <Text fontSize="$2" color="$gray11" margin={0}>
                      Completed: {new Date(cycle.completed_at).toLocaleString()}
                    </Text>
                  )}
                </XStack>
                {cycle.error_message && (
                  <YStack marginTop="$2">
                    <Alert variant="error">
                      <Text fontWeight="600" margin={0}>Error:</Text> {cycle.error_message}
                    </Alert>
                  </YStack>
                )}
                {renderCostBreakdown(cycle)}
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
      {/* Header - only show when not embedded */}
      <XStack justifyContent="space-between" alignItems="center" marginBottom="$5">
        <YStack>
          <Text fontSize="$5" fontWeight="600" color="$color" marginBottom="$1" margin={0}>
            Version History
          </Text>
          <Text fontSize="$2" color="$gray11" margin={0}>
            {versionData.count} {versionData.count === 1 ? 'generation cycle' : 'generation cycles'}
          </Text>
        </YStack>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
      </XStack>

      {/* Search and Filters */}
      {isExpanded && uniqueTypes.length > 0 && (
        <XStack
          gap="$3"
          marginBottom="$3"
          flexWrap="wrap"
          alignItems="center"
        >
          <Input
            flex={1}
            minWidth={200}
            placeholder="Search cycles..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVersionHistory}
            disabled={refreshing}
          >
            ↻ {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Select
            value={filterByType || ''}
            onChange={(e) => setFilterByType(e.target.value || null)}
            size="sm"
          >
            <option value="">All Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {getTypeLabel(type)}
              </option>
            ))}
          </Select>
          {(filterByType || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterByType(null);
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </XStack>
      )}

      {/* Cycles List */}
      {isExpanded && (
        <YStack gap="$2">
          {filteredCycles.length === 0 ? (
            <EmptyStateCard
              title="No cycles match"
              description="Adjust or clear your filters to view version history."
              padding="$4"
              borderWidth={0}
              backgroundColor="transparent"
              titleLevel={5}
            />
          ) : (
            filteredCycles.map((cycle) => (
              <Card
                key={cycle.id}
                variant="outlined"
                padding="$4"
                backgroundColor="$background"
                marginBottom="$3"
              >
                <XStack
                  justifyContent="space-between"
                  alignItems="center"
                  marginBottom="$2"
                >
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$3" fontWeight="600" color="$color" margin={0}>
                      {getTypeLabel(cycle.cycle_type)}
                    </Text>
                    {(() => {
                      const componentLabel = getComponentLabel(cycle.component);
                      const typeLabel = getTypeLabel(cycle.cycle_type);
                      if (!componentLabel) {
                        return null;
                      }

                      if (componentLabel.toLowerCase() === typeLabel.toLowerCase()) {
                        return null;
                      }

                      return (
                        <YStack
                          padding="$0.5 $2"
                          backgroundColor="$gray2"
                          borderRadius="$1"
                        >
                          <Text fontSize="$1" color="$gray11" margin={0}>
                            {componentLabel}
                          </Text>
                        </YStack>
                      );
                    })()}
                  </XStack>
                  <XStack alignItems="center" gap="$2">
                    {cycle.cost !== null && cycle.cost !== undefined && (
                      <YStack
                        padding="$1 $2"
                        backgroundColor="$green2"
                        borderRadius="$1"
                        borderWidth={1}
                        borderColor="$green3"
                      >
                        <Text fontSize="$2" fontWeight="600" color="$green11" margin={0}>
                          ${cycle.cost.toFixed(4)}
                        </Text>
                      </YStack>
                    )}
                    <YStack
                      padding="$1 $2"
                      backgroundColor={getStatusColorHex(cycle.status)}
                      borderRadius="$1"
                    >
                      <Body
                        size="xs"
                        weight="medium"
                        color="#ffffff"
                        transform="uppercase"
                        margin={0}
                      >
                        {cycle.status}
                      </Body>
                    </YStack>
                  </XStack>
                </XStack>
                <XStack gap="$4" flexWrap="wrap">
                  {cycle.progress_total > 0 && (
                    <Text fontSize="$2" color="$gray11" margin={0}>
                      Progress: {cycle.progress_current} / {cycle.progress_total} (
                      {Math.round((cycle.progress_current / cycle.progress_total) * 100)}%)
                    </Text>
                  )}
                  <Text fontSize="$2" color="$gray11" margin={0}>
                    Started: {new Date(cycle.started_at).toLocaleString()}
                  </Text>
                  {cycle.completed_at && (
                    <Text fontSize="$2" color="$gray11" margin={0}>
                      Completed: {new Date(cycle.completed_at).toLocaleString()}
                    </Text>
                  )}
                </XStack>
                {cycle.error_message && (
                  <YStack marginTop="$2">
                    <Alert variant="error">
                      <Text fontWeight="600" margin={0}>Error:</Text> {cycle.error_message}
                    </Alert>
                  </YStack>
                )}
                {renderCostBreakdown(cycle)}
              </Card>
            ))
          )}
        </YStack>
      )}
    </Card>
  );
}
