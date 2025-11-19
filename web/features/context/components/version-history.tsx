'use client';

import { useState } from 'react';
import { useContextVersionsQuery } from '@/shared/hooks/use-context-versions-query';
import { YStack, XStack, Text, Card, Button, Input, Alert } from '@jarvis/ui-core';

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
        <Text fontSize="$1" fontWeight="600" color="$gray11" marginBottom="$1" margin={0}>
          Chat Completions:
        </Text>
        <ul style={{ marginTop: '4px', paddingLeft: '18px', color: '#475569' }}>
          {completions.map((item, index) => (
            <li key={index} style={{ marginBottom: '2px' }}>
              <Text fontSize="$1" color="$gray9" margin={0}>
                {item.model ? `${item.model}` : 'Model unknown'}
                {item.cost !== undefined
                  ? ` · $${item.cost.toFixed(4)}`
                  : null}
                {item.usage
                  ? ` · tokens: ${item.usage.total_tokens ?? '-'} (prompt ${item.usage.prompt_tokens ?? '-'}, completion ${item.usage.completion_tokens ?? '-'})`
                  : null}
              </Text>
            </li>
          ))}
        </ul>
      </YStack>
    );
  };

  if (loading) {
    if (embedded) {
      return (
        <YStack padding="$6" alignItems="center">
          <Text color="$gray11">Loading version history...</Text>
        </YStack>
      );
    }
    return (
      <Card variant="outlined" padding="$6" marginBottom="$6">
        <YStack padding="$6" alignItems="center">
          <Text color="$gray11">Loading version history...</Text>
        </YStack>
      </Card>
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
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onPress={fetchVersionHistory}
            disabled={refreshing}
          >
            ↻ {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <select
            value={filterByType || ''}
            onChange={(e) => setFilterByType(e.target.value || null)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#ffffff',
              fontFamily: 'inherit',
            }}
          >
            <option value="">All Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {getTypeLabel(type)}
              </option>
            ))}
          </select>
          {(filterByType || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
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
            <YStack padding="$6" alignItems="center">
              <Text color="$gray11">No cycles match the selected filter.</Text>
            </YStack>
          ) : (
            filteredCycles.map((cycle) => (
              <Card
                key={cycle.id}
                variant="outlined"
                padding="$3 $4"
                backgroundColor="$gray1"
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
                      <Text
                        fontSize="$1"
                        fontWeight="500"
                        color="#ffffff"
                        textTransform="uppercase"
                        margin={0}
                      >
                        {cycle.status}
                      </Text>
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
                {cycle.cost_breakdown && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '11px',
                      color: '#374151',
                      marginBottom: '4px',
                    }}>
                      Cost Breakdown
                    </summary>
                    <YStack
                      marginTop="$1"
                      paddingLeft="$3"
                      padding="$2"
                      backgroundColor="$gray1"
                      borderRadius="$1"
                      borderWidth={1}
                      borderColor="$borderColor"
                    >
                      <Text fontSize="$1" color="$gray11" marginBottom="$1" margin={0}>
                        <Text fontWeight="600" margin={0}>Total:</Text>{' '}
                        ${cycle.cost_breakdown.total?.toFixed(4) ?? '0.0000'}{' '}
                        {cycle.cost_breakdown.currency || 'USD'}
                      </Text>
                      {cycle.cost_breakdown.breakdown?.openai && (() => {
                        const openaiBreakdown = cycle.cost_breakdown.breakdown?.openai;
                        const openaiTotal =
                          openaiBreakdown && typeof openaiBreakdown.total === 'number'
                            ? openaiBreakdown.total.toFixed(4)
                            : '0.0000';
                        return (
                          <YStack marginTop="$1" gap="$1.5">
                            <Text fontSize="$1" color="$gray11" margin={0}>
                              <Text fontWeight="600" margin={0}>OpenAI:</Text> ${openaiTotal}
                              {openaiBreakdown?.chat_completions?.length > 0 && (
                                <Text margin={0}> ({openaiBreakdown.chat_completions.length} chat completion{openaiBreakdown.chat_completions.length > 1 ? 's' : ''})</Text>
                              )}
                              {openaiBreakdown?.embeddings?.length > 0 && (
                                <Text margin={0}> ({openaiBreakdown.embeddings.length} embedding{openaiBreakdown.embeddings.length > 1 ? 's' : ''})</Text>
                              )}
                            </Text>
                            {renderChatCompletions(openaiBreakdown?.chat_completions || [])}
                            {openaiBreakdown?.embeddings &&
                              openaiBreakdown.embeddings.length > 0 && (
                                <YStack marginTop="$1.5">
                                  <Text fontSize="$1" fontWeight="600" color="$gray11" marginBottom="$1" margin={0}>
                                    Embeddings:
                                  </Text>
                                  <ul style={{ marginTop: '4px', paddingLeft: '18px', color: '#475569' }}>
                                    {openaiBreakdown.embeddings.map(
                                      (
                                        item: {
                                          cost?: number;
                                          model?: string;
                                          usage?: { total_tokens?: number };
                                        },
                                        index: number
                                      ) => (
                                        <li key={index} style={{ marginBottom: '2px' }}>
                                          <Text fontSize="$1" color="$gray9" margin={0}>
                                            {item.model ? `${item.model}` : 'Model unknown'}
                                            {item.cost !== undefined ? ` · $${item.cost.toFixed(4)}` : null}
                                            {item.usage?.total_tokens !== undefined
                                              ? ` · tokens: ${item.usage.total_tokens}`
                                              : null}
                                          </Text>
                                        </li>
                                      )
                                    )}
                                  </ul>
                                </YStack>
                              )}
                          </YStack>
                        );
                      })()}
                      {cycle.cost_breakdown.breakdown?.exa && (() => {
                        const exaBreakdown = cycle.cost_breakdown.breakdown?.exa;
                        const exaTotal =
                          exaBreakdown && typeof exaBreakdown.total === 'number'
                            ? exaBreakdown.total.toFixed(4)
                            : '0.0000';
                        return (
                          <YStack marginTop="$1">
                            <Text fontSize="$1" color="$gray11" margin={0}>
                              <Text fontWeight="600" margin={0}>Exa:</Text> ${exaTotal}
                              {exaBreakdown?.search?.queries > 0 && (
                                <Text margin={0}> ({exaBreakdown.search.queries} search{exaBreakdown.search.queries > 1 ? 'es' : ''})</Text>
                              )}
                              {exaBreakdown?.research?.queries > 0 && (
                                <Text margin={0}> ({exaBreakdown.research.queries} research task{exaBreakdown.research.queries > 1 ? 's' : ''})</Text>
                              )}
                              {exaBreakdown?.answer?.queries > 0 && (
                                <Text margin={0}> ({exaBreakdown.answer.queries} answer{exaBreakdown.answer.queries > 1 ? 's' : ''})</Text>
                              )}
                            </Text>
                          </YStack>
                        );
                      })()}
                      {cycle.cost_breakdown.pricing_version && (
                        <Text fontSize="$1" color="$gray5" marginTop="$1" margin={0}>
                          Pricing version: {cycle.cost_breakdown.pricing_version}
                        </Text>
                      )}
                    </YStack>
                  </details>
                )}
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
          onPress={() => setIsExpanded(!isExpanded)}
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
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onPress={fetchVersionHistory}
            disabled={refreshing}
          >
            ↻ {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <select
            value={filterByType || ''}
            onChange={(e) => setFilterByType(e.target.value || null)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#ffffff',
              fontFamily: 'inherit',
            }}
          >
            <option value="">All Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {getTypeLabel(type)}
              </option>
            ))}
          </select>
          {(filterByType || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
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
            <YStack padding="$6" alignItems="center">
              <Text color="$gray11">No cycles match the selected filter.</Text>
            </YStack>
          ) : (
            filteredCycles.map((cycle) => (
              <Card
                key={cycle.id}
                variant="outlined"
                padding="$3 $4"
                backgroundColor="$gray1"
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
                      <Text
                        fontSize="$1"
                        fontWeight="500"
                        color="#ffffff"
                        textTransform="uppercase"
                        margin={0}
                      >
                        {cycle.status}
                      </Text>
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
                {cycle.cost_breakdown && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '11px',
                      color: '#374151',
                      marginBottom: '4px',
                    }}>
                      Cost Breakdown
                    </summary>
                    <YStack
                      marginTop="$1"
                      paddingLeft="$3"
                      padding="$2"
                      backgroundColor="$gray1"
                      borderRadius="$1"
                      borderWidth={1}
                      borderColor="$borderColor"
                    >
                      <Text fontSize="$1" color="$gray11" marginBottom="$1" margin={0}>
                        <Text fontWeight="600" margin={0}>Total:</Text>{' '}
                        ${cycle.cost_breakdown.total?.toFixed(4) ?? '0.0000'}{' '}
                        {cycle.cost_breakdown.currency || 'USD'}
                      </Text>
                      {cycle.cost_breakdown.breakdown?.openai && (() => {
                        const openaiBreakdown = cycle.cost_breakdown.breakdown?.openai;
                        const openaiTotal =
                          openaiBreakdown && typeof openaiBreakdown.total === 'number'
                            ? openaiBreakdown.total.toFixed(4)
                            : '0.0000';
                        return (
                          <YStack marginTop="$1" gap="$1.5">
                            <Text fontSize="$1" color="$gray11" margin={0}>
                              <Text fontWeight="600" margin={0}>OpenAI:</Text> ${openaiTotal}
                              {openaiBreakdown?.chat_completions?.length > 0 && (
                                <Text margin={0}> ({openaiBreakdown.chat_completions.length} chat completion{openaiBreakdown.chat_completions.length > 1 ? 's' : ''})</Text>
                              )}
                              {openaiBreakdown?.embeddings?.length > 0 && (
                                <Text margin={0}> ({openaiBreakdown.embeddings.length} embedding{openaiBreakdown.embeddings.length > 1 ? 's' : ''})</Text>
                              )}
                            </Text>
                            {renderChatCompletions(openaiBreakdown?.chat_completions || [])}
                            {openaiBreakdown?.embeddings &&
                              openaiBreakdown.embeddings.length > 0 && (
                                <YStack marginTop="$1.5">
                                  <Text fontSize="$1" fontWeight="600" color="$gray11" marginBottom="$1" margin={0}>
                                    Embeddings:
                                  </Text>
                                  <ul style={{ marginTop: '4px', paddingLeft: '18px', color: '#475569' }}>
                                    {openaiBreakdown.embeddings.map(
                                      (
                                        item: {
                                          cost?: number;
                                          model?: string;
                                          usage?: { total_tokens?: number };
                                        },
                                        index: number
                                      ) => (
                                        <li key={index} style={{ marginBottom: '2px' }}>
                                          <Text fontSize="$1" color="$gray9" margin={0}>
                                            {item.model ? `${item.model}` : 'Model unknown'}
                                            {item.cost !== undefined ? ` · $${item.cost.toFixed(4)}` : null}
                                            {item.usage?.total_tokens !== undefined
                                              ? ` · tokens: ${item.usage.total_tokens}`
                                              : null}
                                          </Text>
                                        </li>
                                      )
                                    )}
                                  </ul>
                                </YStack>
                              )}
                          </YStack>
                        );
                      })()}
                      {cycle.cost_breakdown.breakdown?.exa && (() => {
                        const exaBreakdown = cycle.cost_breakdown.breakdown?.exa;
                        const exaTotal =
                          exaBreakdown && typeof exaBreakdown.total === 'number'
                            ? exaBreakdown.total.toFixed(4)
                            : '0.0000';
                        return (
                          <YStack marginTop="$1">
                            <Text fontSize="$1" color="$gray11" margin={0}>
                              <Text fontWeight="600" margin={0}>Exa:</Text> ${exaTotal}
                              {exaBreakdown?.search?.queries > 0 && (
                                <Text margin={0}> ({exaBreakdown.search.queries} search{exaBreakdown.search.queries > 1 ? 'es' : ''})</Text>
                              )}
                              {exaBreakdown?.research?.queries > 0 && (
                                <Text margin={0}> ({exaBreakdown.research.queries} research task{exaBreakdown.research.queries > 1 ? 's' : ''})</Text>
                              )}
                              {exaBreakdown?.answer?.queries > 0 && (
                                <Text margin={0}> ({exaBreakdown.answer.queries} answer{exaBreakdown.answer.queries > 1 ? 's' : ''})</Text>
                              )}
                            </Text>
                          </YStack>
                        );
                      })()}
                      {cycle.cost_breakdown.pricing_version && (
                        <Text fontSize="$1" color="$gray5" marginTop="$1" margin={0}>
                          Pricing version: {cycle.cost_breakdown.pricing_version}
                        </Text>
                      )}
                    </YStack>
                  </details>
                )}
              </Card>
            ))
          )}
        </YStack>
      )}
    </Card>
  );
}

