'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase/client';
import { useContextDatabaseQuery } from '@/shared/hooks/use-context-database-query';
import {
  YStack,
  XStack,
  Card,
  Button,
  Input,
  Alert,
  Heading,
  Body,
  Label,
  Caption,
  Badge,
  Select,
  EmptyStateCard,
  LoadingState,
  Skeleton,
  Text,
  Toolbar,
  ClampText,
} from '@jarvis/ui-core';

interface ContextItem {
  id: string;
  chunk: string;
  metadata: {
    source?: string;
    enrichment_source?: string;
    research_source?: string;
    component_type?: string;
    quality_score?: number | string;
    chunk_size?: number | string;
    enrichment_timestamp?: string;
  } | null;
  rank: number | null;
  generation_cycle_id: string | null;
  // Phase 4: All metadata fields (source, enrichment_source, etc.) are now in metadata JSONB
}

interface ContextStats {
  total: number;
  bySource: Record<string, number>;
  byEnrichmentSource: Record<string, number>;
  avgQualityScore: number;
  totalChars: number;
  byResearchSource?: Record<string, number>;
}

interface ContextDatabaseVisualizationProps {
  eventId: string;
  agentStatus?: string | null; // Deprecated: use agentStatus and agentStage instead
  agentStage?: string | null; // Deprecated: use agentStatus and agentStage instead
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

export function ContextDatabaseVisualization({ eventId, agentStatus, agentStage, embedded = false }: ContextDatabaseVisualizationProps) {
  const queryClient = useQueryClient();
  const { data: contextItems = [], isLoading, error, refetch, isFetching } = useContextDatabaseQuery(eventId);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(embedded); // Auto-expand when embedded
  const [isRealTime, setIsRealTime] = useState(false);
  const [filterByRank, setFilterByRank] = useState<string | null>(null);
  const [filterByResearchSource, setFilterByResearchSource] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const handleRefresh = () => {
    refetch();
  };

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Calculate statistics
  useEffect(() => {
    if (contextItems.length === 0) {
      setStats(null);
      return;
    }

    const bySource: Record<string, number> = {};
    const byEnrichmentSource: Record<string, number> = {};
    let totalQuality = 0;
    let qualityCount = 0;
    let totalChars = 0;

    contextItems.forEach((item) => {
      // Count by source (from metadata)
      const source = item.metadata?.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
      
      // Count by enrichment source (from metadata)
      const enrichmentSource = item.metadata?.enrichment_source || item.metadata?.source || 'unknown';
      byEnrichmentSource[enrichmentSource] = (byEnrichmentSource[enrichmentSource] || 0) + 1;
      
      // Quality score (from metadata)
      const qualityScore = item.metadata?.quality_score;
      if (qualityScore !== null && qualityScore !== undefined) {
        const score = typeof qualityScore === 'string' ? parseFloat(qualityScore) : qualityScore;
        if (!isNaN(score)) {
          totalQuality += score;
          qualityCount++;
        }
      }
      
      // Character count (from metadata or chunk length)
      const chunkSize = item.metadata?.chunk_size;
      if (chunkSize !== null && chunkSize !== undefined) {
        totalChars += typeof chunkSize === 'string' ? parseInt(chunkSize, 10) : chunkSize;
      } else {
        totalChars += item.chunk.length;
      }
    });

    // Calculate unique research sources (from metadata)
    const byResearchSource: Record<string, number> = {};
    contextItems.forEach((item) => {
      const researchSource = item.metadata?.research_source || 'none';
      byResearchSource[researchSource] = (byResearchSource[researchSource] || 0) + 1;
    });

    setStats({
      total: contextItems.length,
      bySource,
      byEnrichmentSource,
      avgQualityScore: qualityCount > 0 ? totalQuality / qualityCount : 0,
      totalChars,
      byResearchSource,
    });
  }, [contextItems]);

  // React Query handles initial fetch automatically

  // Real-time subscription for context_items
  useEffect(() => {
    if (!eventId || !isExpanded) return;

    console.log(`[context-db] Subscribing to context_items for event ${eventId}`);
    setIsRealTime(true);

    const channel = supabase
      .channel(`context_items:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'context_items',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[context-db] New context item inserted:', payload.new);
          // Invalidate React Query cache to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['context-database', eventId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'context_items',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[context-db] Context item updated:', payload.new);
          // Invalidate React Query cache to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['context-database', eventId] });
        }
      )
      .subscribe((status) => {
        console.log(`[context-db] Subscription status: ${status}`);
      });

    return () => {
      console.log(`[context-db] Unsubscribing from context_items for event ${eventId}`);
      supabase.removeChannel(channel);
      setIsRealTime(false);
    };
  }, [eventId, isExpanded]);

  const getSourceColor = (source: string): string => {
    switch (source) {
      case 'topic_prep':
      case 'llm_generation':
        return '#3b82f6'; // blue
      case 'enrichment':
      case 'web_search':
        return '#10b981'; // green
      case 'wikipedia':
        return '#8b5cf6'; // purple
      case 'document_extractor':
        return '#f59e0b'; // amber
      default:
        return '#64748b'; // gray
    }
  };

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'topic_prep':
        return 'Topic Prep (LLM)';
      case 'llm_generation':
        return 'LLM Generated';
      case 'web_search':
        return 'Web Search';
      case 'wikipedia':
        return 'Wikipedia';
      case 'document_extractor':
        return 'Documents';
      case 'enrichment':
        return 'Enrichment';
      default:
        return source;
    }
  };

  // Use status + stage if available, otherwise fall back to old agentStatus string
  // For new schema: status='idle' + stage='prepping' means prepping
  //                  status='idle' + stage='context_complete' means ready
  //                  status='active' + stage='running' means running
  const isPrepping = (agentStatus === 'idle' && agentStage === 'prepping') || agentStatus === 'prepping';
  const isReady = (agentStatus === 'idle' && agentStage === 'context_complete') || agentStatus === 'context_complete';
  const isRunning = (agentStatus === 'active' && agentStage === 'running') || agentStatus === 'running';

  // Filter context items
  const filteredItems = contextItems.filter((item) => {
    if (filterByRank && item.rank === null) return false;
    if (filterByRank === 'ranked' && item.rank === null) return false;
    if (filterByRank === 'unranked' && item.rank !== null) return false;
    if (filterByResearchSource && item.metadata?.research_source !== filterByResearchSource) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesQuery = item.chunk.toLowerCase().includes(query) ||
                           (item.metadata?.source && item.metadata.source.toLowerCase().includes(query)) ||
                           (item.metadata?.research_source && item.metadata.research_source.toLowerCase().includes(query));
      if (!matchesQuery) return false;
    }
    return true;
  });

  // Get unique research sources for filter (from metadata)
  const researchSources = Array.from(
    new Set(contextItems.map((item) => item.metadata?.research_source).filter(Boolean))
  ).sort() as string[];

  return (
    <YStack
      backgroundColor={embedded ? 'transparent' : '$background'}
      borderWidth={embedded ? 0 : 1}
      borderColor={embedded ? 'transparent' : '$borderColor'}
      borderRadius={embedded ? 0 : '$4'}
      padding={embedded ? 0 : '$6'}
      marginBottom={embedded ? 0 : '$6'}
    >
      {/* Header - only show when not embedded */}
      {!embedded && (
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$5">
          <YStack>
            <Heading level={3}>Context Database</Heading>
            <XStack alignItems="center" gap="$3">
              {isLoading ? (
                <Skeleton width={140} height={16} />
              ) : (
                <Body tone="muted">{`${stats?.total || 0} / 1,000 chunks`}</Body>
              )}
              {isRealTime && (
                <Badge variant="green" size="sm">
                  Live
                </Badge>
              )}
            </XStack>
          </YStack>
          <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </XStack>
      )}

      {/* Stats Overview */}
      {stats && (
        <Card variant="outlined" padding="$4" marginBottom="$5">
          <XStack flexWrap="wrap" gap="$4" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }}>
            <YStack flex={1} minWidth={120}>
              <Label size="xs">Total Chunks</Label>
              <Heading level={3}>{stats.total}</Heading>
            </YStack>
            <YStack flex={1} minWidth={120}>
              <Label size="xs">Avg Quality</Label>
              <Heading
                level={3}
                color={
                  stats.avgQualityScore >= 0.7
                    ? '$green11'
                    : stats.avgQualityScore >= 0.4
                    ? '$yellow11'
                    : '$red11'
                }
              >
                {(stats.avgQualityScore * 100).toFixed(0)}%
              </Heading>
            </YStack>
            <YStack flex={1} minWidth={120}>
              <Label size="xs">Total Chars</Label>
              <Heading level={3}>{stats.totalChars.toLocaleString()}</Heading>
            </YStack>
          </XStack>
        </Card>
      )}

      {/* Source Breakdown */}
      {stats && stats.byEnrichmentSource && Object.keys(stats.byEnrichmentSource).length > 0 && (
        <XStack
          flexWrap="wrap"
          gap="$3"
          marginBottom="$5"
          padding="$4"
          backgroundColor="$gray1"
          borderRadius="$3"
          $sm={{ flexDirection: 'column' }}
          $md={{ flexDirection: 'row' }}
        >
          {Object.entries(stats.byEnrichmentSource).map(([source, count]) => (
            <YStack key={source} flex={1} minWidth={120}>
              <Label
                size="xs"
                tone="muted"
                uppercase
                letterSpacing={0.5}
                marginBottom="$1"
                margin={0}
              >
                {getSourceLabel(source)}
              </Label>
              <Text fontSize="$5" fontWeight="700" color="$color" margin={0}>
                {count}
              </Text>
            </YStack>
          ))}
        </XStack>
      )}

      {/* Status Indicator - Only show during active building */}
      {isPrepping && contextItems.length === 0 && (
        <Alert variant="warning" marginBottom="$5">
          <YStack gap="$2">
            <Body>
              ⚡ Building context database... Chunks will appear here as they are generated.
            </Body>
            <Body size="sm" tone="muted">
              Agent status:{' '}
              <Body size="sm" weight="medium">
                {agentStatus}
              </Body>{' '}
              - The worker should be processing this every 3 seconds.
              {!isRealTime && ' Make sure the worker is running!'}
            </Body>
          </YStack>
        </Alert>
      )}

      {/* Search and Filters */}
      {isExpanded && contextItems.length > 0 && (
        <Toolbar marginBottom="$3">
          <Toolbar.Item flex={1}>
            <Input
              placeholder="Search chunks..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              width="100%"
            />
          </Toolbar.Item>
          <Toolbar.Item flex={0} minWidth={200}>
            <Select
              value={filterByRank || ''}
              onChange={(e) => setFilterByRank(e.target.value || null)}
            >
              <option value="">All Ranks</option>
              <option value="ranked">Ranked Only</option>
              <option value="unranked">Unranked Only</option>
            </Select>
          </Toolbar.Item>
          {researchSources.length > 0 && (
            <Toolbar.Item flex={0} minWidth={200}>
              <Select
                value={filterByResearchSource || ''}
                onChange={(e) => setFilterByResearchSource(e.target.value || null)}
              >
                <option value="">All Research Sources</option>
                {researchSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </Toolbar.Item>
          )}
          <Toolbar.Item flex={0}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <XStack alignItems="center" gap="$1">
                <Text margin={0}>↻</Text>
                <Text margin={0}>{isFetching ? 'Refreshing...' : 'Refresh'}</Text>
              </XStack>
            </Button>
          </Toolbar.Item>
          {(filterByRank || filterByResearchSource || searchQuery) && (
            <Toolbar.Item flex={0}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterByRank(null);
                  setFilterByResearchSource(null);
                  setSearchQuery('');
                }}
              >
                <Text margin={0}>Clear Filters</Text>
              </Button>
            </Toolbar.Item>
          )}
        </Toolbar>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <>
          {isLoading ? (
            <YStack marginTop="$5">
              <LoadingState
                title="Loading context items"
                description="Fetching the most recent context chunks."
              />
            </YStack>
          ) : (
            <YStack
              marginTop="$5"
              maxHeight={600}
              overflow="scroll"
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$3"
              backgroundColor="$gray1"
            >
              {error ? (
            <YStack padding="$6" alignItems="center">
              <Alert variant="error">
                Error loading context items: {error instanceof Error ? error.message : 'Unknown error'}
              </Alert>
            </YStack>
          ) : filteredItems.length === 0 ? (
            <EmptyStateCard
              title={
                filterByRank || filterByResearchSource
                  ? 'No context items match'
                  : contextItems.length === 0
                  ? 'No context items yet'
                  : 'No context items match'
              }
              description={
                filterByRank || filterByResearchSource
                  ? 'Adjust or clear your filters to view additional items.'
                  : contextItems.length === 0
                  ? 'Expand this panel after context generation to see the populated database.'
                  : 'Try refining or clearing your filters.'
              }
              padding="$6"
              titleLevel={5}
            />
          ) : (
            <YStack padding="$2">
              {filteredItems.map((item) => {
                const isExpandedItem = expandedItems.has(item.id);
                const qualityScore = item.metadata?.quality_score !== null && item.metadata?.quality_score !== undefined
                  ? (typeof item.metadata.quality_score === 'string' 
                      ? parseFloat(item.metadata.quality_score) 
                      : item.metadata.quality_score)
                  : null;
                const sourceColor = getSourceColor(item.metadata?.enrichment_source || item.metadata?.source || 'unknown');
                const sourceColorHex = getSourceColor(item.metadata?.enrichment_source || item.metadata?.source || 'unknown');
                
                return (
                  <Card
                    key={item.id}
                    variant="outlined"
                    padding={0}
                    marginBottom="$3"
                    backgroundColor="$background"
                    overflow="hidden"
                  >
                    {/* Item Header */}
                    <XStack
                      width="100%"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      padding="$4"
                      marginBottom={isExpandedItem ? '$3' : 0}
                      onPress={() => toggleItem(item.id)}
                      cursor="pointer"
                    >
                      <YStack flex={1} gap="$2" minWidth={0} flexShrink={1}>
                        <XStack alignItems="center" gap="$2" marginBottom="$2">
                          <YStack
                            width={8}
                            height={8}
                            borderRadius="$10"
                            backgroundColor={sourceColorHex}
                            flexShrink={0}
                          />
                          <Label size="xs" tone="muted" uppercase margin={0}>
                            {getSourceLabel(item.metadata?.enrichment_source || item.metadata?.source || 'unknown')}
                          </Label>
                          {item.rank !== null && (
                            <Badge variant="blue" size="sm">
                              Rank: {item.rank}
                            </Badge>
                          )}
                          {item.metadata?.research_source && (
                            <Badge variant="gray" size="sm">
                              {item.metadata.research_source}
                            </Badge>
                          )}
                        </XStack>
                        <ClampText
                          fontSize="$4"
                          fontWeight="600"
                          color="$color"
                          marginBottom="$2"
                          margin={0}
                          textAlign="left"
                          numberOfLines={3}
                        >
                          {item.chunk}
                        </ClampText>
                      </YStack>
                      <XStack alignItems="center" marginLeft="$4" flexShrink={0}>
                        <Text fontSize="$5" color="$gray11" margin={0}>
                          {isExpandedItem ? '▼' : '▶'}
                        </Text>
                      </XStack>
                    </XStack>

                    {/* Expanded Details */}
                    {isExpandedItem && (
                      <YStack
                        paddingTop="$3"
                        paddingHorizontal="$4"
                        paddingBottom="$4"
                        borderTopWidth={1}
                        borderTopColor="$borderColor"
                      >
                        <Body
                          size="md"
                          tone="muted"
                          marginBottom="$3"
                          whitespace="preWrap"
                        >
                          {item.chunk}
                        </Body>
                        <XStack
                          gap="$4"
                          paddingTop="$3"
                          borderTopWidth={1}
                          borderTopColor="$borderColor"
                          flexWrap="wrap"
                        >
                          {qualityScore !== null && (
                            <XStack alignItems="center" gap="$1">
                              <Text fontSize="$2" color="$gray11" fontWeight="600" margin={0}>
                                Quality:
                              </Text>
                              <Text fontSize="$2" color="$gray11" margin={0}>
                                {(qualityScore * 100).toFixed(0)}%
                              </Text>
                            </XStack>
                          )}
                          {item.metadata?.chunk_size && (
                            <XStack alignItems="center" gap="$1">
                              <Text fontSize="$2" color="$gray11" fontWeight="600" margin={0}>
                                Size:
                              </Text>
                              <Text fontSize="$2" color="$gray11" margin={0}>
                                {typeof item.metadata.chunk_size === 'string' 
                                  ? parseInt(item.metadata.chunk_size, 10) 
                                  : item.metadata.chunk_size} chars
                              </Text>
                            </XStack>
                          )}
                          {item.metadata?.enrichment_timestamp && (
                            <XStack alignItems="center" gap="$1">
                              <Text fontSize="$2" color="$gray11" fontWeight="600" margin={0}>
                                Added:
                              </Text>
                              <Text fontSize="$2" color="$gray11" margin={0}>
                                {new Date(item.metadata.enrichment_timestamp).toLocaleString()}
                              </Text>
                            </XStack>
                          )}
                        </XStack>
                        {item.metadata && Object.keys(item.metadata).length > 0 && (
                          <YStack marginTop="$3" gap="$2">
                            <Label size="xs" tone="muted" uppercase margin={0}>
                              Metadata
                            </Label>
                            <YStack
                              padding="$2"
                              backgroundColor="$gray1"
                              borderRadius="$2"
                            >
                              <Caption mono whitespace="preWrap">
                                {JSON.stringify(item.metadata, null, 2)}
                              </Caption>
                            </YStack>
                          </YStack>
                        )}
                      </YStack>
                    )}
                  </Card>
                );
              })}
            </YStack>
          )}
            </YStack>
        )}
        </>
      )}
    </YStack>
  );
}
