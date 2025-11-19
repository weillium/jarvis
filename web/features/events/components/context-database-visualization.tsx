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
  Badge,
  Select,
  EmptyStateCard,
  LoadingState,
  Skeleton,
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

  const handleRefresh = () => {
    refetch();
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
          <Button variant="outline" size="sm" onPress={() => setIsExpanded(!isExpanded)}>
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
        <Card variant="outlined" padding="$4" marginBottom="$5">
          <Label marginBottom="$3">Source Breakdown</Label>
          <XStack flexWrap="wrap" gap="$2">
            {Object.entries(stats.byEnrichmentSource).map(([source, count]) => (
              <XStack
                key={source}
                alignItems="center"
                gap="$1.5"
                padding="$1.5 $3"
                backgroundColor="$background"
                borderWidth={1}
                borderColor={getSourceColor(source)}
                borderRadius="$2"
                fontSize="$3"
              >
                <YStack
                  width={8}
                  height={8}
                  borderRadius="$10"
                  backgroundColor={getSourceColor(source)}
                />
                <Body weight="medium">{getSourceLabel(source)}</Body>
                <Body tone="muted">{count}</Body>
              </XStack>
            ))}
          </XStack>
        </Card>
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
        <XStack
          gap="$3"
          marginTop="$5"
          marginBottom="$3"
          flexWrap="wrap"
          alignItems="center"
        >
          <Input flex={1} minWidth={200} placeholder="Search chunks..." value={searchQuery} onChangeText={setSearchQuery} />
          <Button
            variant="outline"
            size="sm"
            onPress={handleRefresh}
            disabled={isFetching}
          >
            ↻ {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Select
            value={filterByRank || ''}
            onChange={(e) => setFilterByRank(e.target.value || null)}
            size="sm"
          >
            <option value="">All Ranks</option>
            <option value="ranked">Ranked Only</option>
            <option value="unranked">Unranked Only</option>
          </Select>
          {researchSources.length > 0 && (
            <Select
              value={filterByResearchSource || ''}
              onChange={(e) => setFilterByResearchSource(e.target.value || null)}
              size="sm"
            >
              <option value="">All Research Sources</option>
              {researchSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          )}
          {(filterByRank || filterByResearchSource || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setFilterByRank(null);
                setFilterByResearchSource(null);
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </XStack>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <YStack
          marginTop="$5"
          maxHeight={600}
          overflowY="auto"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$3"
          backgroundColor="$gray1"
        >
          {isLoading ? (
            <LoadingState
              title="Loading context items"
              description="Fetching the most recent context chunks."
              padding="$6"
              align="start"
              skeletons={[
                { height: 64, width: '100%' },
                { height: 64, width: '100%' },
                { height: 64, width: '100%' },
              ]}
            />
          ) : error ? (
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
              borderWidth={0}
              backgroundColor="transparent"
              titleLevel={5}
            />
          ) : (
            <YStack padding="$2">
              {filteredItems.map((item) => {
                const qualityScore = item.metadata?.quality_score !== null && item.metadata?.quality_score !== undefined
                  ? (typeof item.metadata.quality_score === 'string' 
                      ? parseFloat(item.metadata.quality_score) 
                      : item.metadata.quality_score)
                  : null;
                const sourceColor = getSourceColor(item.metadata?.enrichment_source || item.metadata?.source || 'unknown');
                
                return (
                  <Card
                    key={item.id}
                    variant="outlined"
                    padding="$4"
                    marginBottom="$2"
                    backgroundColor="$background"
                  >
                    <XStack
                      justifyContent="space-between"
                      alignItems="flex-start"
                      marginBottom="$2"
                    >
                      <XStack alignItems="center" gap="$2">
                        {item.rank !== null && (
                          <Badge variant="blue" size="sm">
                            Rank: {item.rank}
                          </Badge>
                        )}
                        <YStack
                          width={8}
                          height={8}
                          borderRadius="$10"
                          backgroundColor={sourceColor}
                        />
                        <Body size="sm" weight="medium">
                          {getSourceLabel(item.metadata?.enrichment_source || item.metadata?.source || 'unknown')}
                        </Body>
                        {item.metadata?.research_source && (
                          <Badge variant="gray" size="sm">
                            Research: {item.metadata.research_source}
                          </Badge>
                        )}
                     </XStack>
                     <XStack alignItems="center" gap="$2">
                       {qualityScore !== null && (
                          <Badge
                            variant={
                              qualityScore >= 0.7
                                ? 'green'
                                : qualityScore >= 0.4
                                ? 'yellow'
                                : 'red'
                            }
                            size="sm"
                          >
                            <Body size="xs" weight="medium" color="$color">
                              Quality: {(qualityScore * 100).toFixed(0)}%
                            </Body>
                          </Badge>
                        )}
                        {item.metadata?.chunk_size && (
                          <Body size="xs" tone="muted">
                            {typeof item.metadata.chunk_size === 'string' 
                              ? parseInt(item.metadata.chunk_size, 10) 
                              : item.metadata.chunk_size} chars
                          </Body>
                        )}
                      </XStack>
                    </XStack>
                    <Body lineHeight={1.6} marginBottom="$2" whiteSpace="pre-wrap">
                      {item.chunk}
                    </Body>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <YStack marginTop="$2" gap="$1">
                        <Label size="xs">Metadata</Label>
                        <YStack
                          padding="$2"
                          backgroundColor="$gray1"
                          borderRadius="$1"
                        >
                          <Body size="xs" fontFamily="$mono" whiteSpace="pre-wrap">
                            {JSON.stringify(item.metadata, null, 2)}
                          </Body>
                        </YStack>
                      </YStack>
                    )}
                    {item.metadata?.enrichment_timestamp && (
                      <Body size="xs" tone="muted" marginTop="$1">
                        Added: {new Date(item.metadata.enrichment_timestamp).toLocaleTimeString()}
                      </Body>
                    )}
                  </Card>
                );
              })}
            </YStack>
          )}
        </YStack>
      )}
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
    </YStack>
  );
}
