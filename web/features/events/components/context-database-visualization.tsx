'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase/client';
import { useContextDatabaseQuery } from '@/shared/hooks/use-context-database-query';
import { YStack, XStack, Text, Card, Button, Input, Alert } from '@jarvis/ui-core';

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
        <XStack
          justifyContent="space-between"
          alignItems="center"
          marginBottom="$5"
        >
          <YStack>
            <Text fontSize="$5" fontWeight="600" color="$color" marginBottom="$1" margin={0}>
              Context Database
            </Text>
            <XStack alignItems="center" gap="$3" fontSize="$3" color="$gray11">
              <Text>
                {isLoading ? 'Loading...' : `${stats?.total || 0} / 1,000 chunks`}
              </Text>
              {isRealTime && (
                <XStack alignItems="center" gap="$1">
                  <YStack
                    width={8}
                    height={8}
                    borderRadius="$10"
                    backgroundColor="$green11"
                    opacity={0.8}
                    style={{
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }}
                  />
                  <Text>Live</Text>
                </XStack>
              )}
            </XStack>
          </YStack>
          {!embedded && (
            <Button
              variant="outline"
              size="sm"
              onPress={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          )}
        </XStack>
      )}

      {/* Stats Overview */}
      {stats && (
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
          <YStack flex={1} minWidth={120}>
            <Text
              fontSize="$1"
              fontWeight="600"
              color="$gray11"
              textTransform="uppercase"
              letterSpacing={0.5}
              marginBottom="$1"
            >
              Total Chunks
            </Text>
            <Text fontSize="$5" fontWeight="700" color="$color">
              {stats.total}
            </Text>
          </YStack>
          <YStack flex={1} minWidth={120}>
            <Text
              fontSize="$1"
              fontWeight="600"
              color="$gray11"
              textTransform="uppercase"
              letterSpacing={0.5}
              marginBottom="$1"
            >
              Avg Quality
            </Text>
            <Text
              fontSize="$5"
              fontWeight="700"
              color={
                stats.avgQualityScore >= 0.7
                  ? '$green11'
                  : stats.avgQualityScore >= 0.4
                  ? '$yellow11'
                  : '$red11'
              }
            >
              {(stats.avgQualityScore * 100).toFixed(0)}%
            </Text>
          </YStack>
          <YStack flex={1} minWidth={120}>
            <Text
              fontSize="$1"
              fontWeight="600"
              color="$gray11"
              textTransform="uppercase"
              letterSpacing={0.5}
              marginBottom="$1"
            >
              Total Chars
            </Text>
            <Text fontSize="$5" fontWeight="700" color="$color">
              {stats.totalChars.toLocaleString()}
            </Text>
          </YStack>
        </XStack>
      )}

      {/* Source Breakdown */}
      {stats && stats.byEnrichmentSource && Object.keys(stats.byEnrichmentSource).length > 0 && (
        <YStack marginBottom="$5" padding="$4" backgroundColor="$gray1" borderRadius="$3">
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$3"
          >
            Source Breakdown
          </Text>
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
                <Text color="$color" fontWeight="500">
                  {getSourceLabel(source)}
                </Text>
                <Text color="$gray11">
                  {count}
                </Text>
              </XStack>
            ))}
          </XStack>
        </YStack>
      )}

      {/* Status Indicator - Only show during active building */}
      {isPrepping && contextItems.length === 0 && (
        <Alert variant="warning" marginBottom="$5">
          <YStack gap="$2">
            <Text>
              ⚡ Building context database... Chunks will appear here as they are generated.
            </Text>
            <Text fontSize="$2" opacity={0.8}>
              Agent status: <Text fontWeight="600">{agentStatus}</Text> - The worker should be processing this every 3 seconds.
              {!isRealTime && ' Make sure the worker is running!'}
            </Text>
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
          <Input
            flex={1}
            minWidth={200}
            placeholder="Search chunks..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
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
          </select>
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
            </select>
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
            <YStack padding="$6" alignItems="center">
              <Text color="$gray11">Loading context items...</Text>
            </YStack>
          ) : error ? (
            <YStack padding="$6" alignItems="center">
              <Alert variant="error">
                Error loading context items: {error instanceof Error ? error.message : 'Unknown error'}
              </Alert>
            </YStack>
          ) : filteredItems.length === 0 ? (
            <YStack padding="$6" alignItems="center">
              <Text color="$gray11">
                {(filterByRank || filterByResearchSource)
                  ? 'No context items match the selected filters.'
                  : contextItems.length === 0
                  ? 'No context items found. Expand to view chunks when they are available.'
                  : 'No context items match the current filters.'}
              </Text>
            </YStack>
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
                          <YStack
                            padding="$0.5 $2"
                            backgroundColor="$blue2"
                            borderRadius="$1"
                          >
                            <Text fontSize="$1" fontWeight="600" color="$blue11">
                              Rank: {item.rank}
                            </Text>
                          </YStack>
                        )}
                        <YStack
                          width={8}
                          height={8}
                          borderRadius="$10"
                          backgroundColor={sourceColor}
                        />
                        <Text
                          fontSize="$2"
                          fontWeight="600"
                          color="$gray11"
                          textTransform="uppercase"
                        >
                          {getSourceLabel(item.metadata?.enrichment_source || item.metadata?.source || 'unknown')}
                        </Text>
                        {item.metadata?.research_source && (
                          <YStack
                            padding="$0.5 $2"
                            backgroundColor="$gray2"
                            borderRadius="$1"
                          >
                            <Text fontSize="$1" fontWeight="500" color="$gray9">
                              Research: {item.metadata.research_source}
                            </Text>
                          </YStack>
                        )}
                      </XStack>
                      <XStack alignItems="center" gap="$2">
                        {qualityScore !== null && (
                          <YStack
                            padding="$0.5 $2"
                            backgroundColor={
                              qualityScore >= 0.7
                                ? '$green2'
                                : qualityScore >= 0.4
                                ? '$yellow2'
                                : '$red2'
                            }
                            borderRadius="$1"
                          >
                            <Text fontSize="$1" fontWeight="500" color="$color">
                              Quality: {(qualityScore * 100).toFixed(0)}%
                            </Text>
                          </YStack>
                        )}
                        {item.metadata?.chunk_size && (
                          <Text fontSize="$1" color="$gray5">
                            {typeof item.metadata.chunk_size === 'string' 
                              ? parseInt(item.metadata.chunk_size, 10) 
                              : item.metadata.chunk_size} chars
                          </Text>
                        )}
                      </XStack>
                    </XStack>
                    <Text
                      fontSize="$3"
                      color="$gray9"
                      lineHeight={1.6}
                      marginBottom="$2"
                      whiteSpace="pre-wrap"
                    >
                      {item.chunk}
                    </Text>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: '500', fontSize: '11px', color: '#64748b' }}>
                          Metadata
                        </summary>
                        <YStack
                          marginTop="$2"
                          padding="$2"
                          backgroundColor="$gray1"
                          borderRadius="$1"
                        >
                          <Text
                            fontSize="$1"
                            fontFamily="$mono"
                            color="$gray11"
                            whiteSpace="pre-wrap"
                          >
                            {JSON.stringify(item.metadata, null, 2)}
                          </Text>
                        </YStack>
                      </details>
                    )}
                    {item.metadata?.enrichment_timestamp && (
                      <Text fontSize="$1" color="$gray5" marginTop="$1">
                        Added: {new Date(item.metadata.enrichment_timestamp).toLocaleTimeString()}
                      </Text>
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

