'use client';

import { useState } from 'react';
import { useResearchQuery } from '@/shared/hooks/use-research-query';
import type { ResearchResult } from '@/shared/hooks/use-research-query';
import {
  YStack,
  XStack,
  Text,
  Body,
  Button,
  Input,
  Card,
  Alert,
  Select,
  Anchor,
  EmptyStateCard,
  LoadingState,
  Caption,
  Label,
  ClampText,
  Toolbar,
  ToolbarSpacer,
} from '@jarvis/ui-core';

interface ResearchResultsVisualizationProps {
  eventId: string;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

export function ResearchResultsVisualization({ eventId, embedded = false }: ResearchResultsVisualizationProps) {
  const [isExpanded, setIsExpanded] = useState(embedded); // Auto-expand when embedded
  const [filterByApi, setFilterByApi] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [expandedMetadata, setExpandedMetadata] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pass filters to query hook - filtering is now done at database level
  const { data: researchData, isLoading, error, refetch, isFetching } = useResearchQuery(eventId, {
    search: searchQuery || undefined,
    api: filterByApi || undefined,
  });

  const handleRefresh = () => {
    refetch();
  };

  const toggleResult = (resultId: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const toggleMetadata = (resultId: string) => {
    setExpandedMetadata((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const getApiColor = (api: string): string => {
    switch (api) {
      case 'exa':
        return '$green11';
      case 'wikipedia':
        return '$purple11';
      case 'llm_stub':
        return '$blue11';
      default:
        return '$gray11';
    }
  };

  const getApiColorHex = (api: string): string => {
    switch (api) {
      case 'exa':
        return '#10b981';
      case 'wikipedia':
        return '#8b5cf6';
      case 'llm_stub':
        return '#3b82f6';
      default:
        return '#64748b';
    }
  };

  const getApiLabel = (api: string): string => {
    switch (api) {
      case 'exa':
        return 'Exa Search';
      case 'wikipedia':
        return 'Wikipedia';
      case 'llm_stub':
        return 'LLM Stub';
      default:
        return api;
    }
  };

  // Results are already filtered by database - no client-side filtering needed
  const filteredResults = researchData?.results || [];

  // Get unique APIs for filter (from all results, not just filtered)
  // Note: This requires a separate query or we accept that filter options are based on current results
  const apis = researchData
    ? Array.from(new Set(researchData.results.map((r) => r.api))).sort()
    : [];

  if (isLoading) {
    return (
      <LoadingState
        title="Loading research results"
        description="Fetching the latest research runs."
      />
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <Text fontSize="$3" margin={0}>
          Error loading research results: {error instanceof Error ? error.message : 'Unknown error'}
        </Text>
      </Alert>
    );
  }

  if (!researchData || researchData.count === 0) {
    return (
      <EmptyStateCard
        title="No research results yet"
        description="Results will appear here after the research phase completes."
        align="center"
        padding="$6"
        titleLevel={5}
      />
    );
  }

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
              Research Results
            </Text>
            <XStack alignItems="center" gap="$3">
              <Text fontSize="$2" color="$gray11" margin={0}>
                {`${researchData.count} ${researchData.count === 1 ? 'result' : 'results'}`}
              </Text>
              {researchData.avgQualityScore > 0 && (
                <XStack alignItems="center" gap="$1">
                  <Text fontSize="$2" color="$gray11" margin={0}>
                    Avg Quality:
                  </Text>
                  <Text fontSize="$2" color="$gray11" margin={0}>
                    {(researchData.avgQualityScore * 100).toFixed(0)}%
                  </Text>
                </XStack>
              )}
            </XStack>
          </YStack>
          {!embedded && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <Text margin={0}>{isExpanded ? 'Collapse' : 'Expand'}</Text>
            </Button>
          )}
        </XStack>
      )}

      {/* Stats Overview */}
      {researchData.byApi && Object.keys(researchData.byApi).length > 0 && (
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
          {Object.entries(researchData.byApi).map(([api, count]) => (
            <YStack key={api} flex={1} minWidth={120}>
              <Label
                size="xs"
                tone="muted"
                uppercase
                letterSpacing={0.5}
                marginBottom="$1"
                margin={0}
              >
                {getApiLabel(api)}
              </Label>
              <Text fontSize="$5" fontWeight="700" color="$color" margin={0}>
                {count}
              </Text>
            </YStack>
          ))}
        </XStack>
      )}

      {/* Search and Filters */}
      {isExpanded && researchData.count > 0 && (
        <Toolbar marginBottom="$3">
          <Toolbar.Item flex={1}>
            <Input
              placeholder="Search results..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              width="100%"
            />
          </Toolbar.Item>
          {apis.length > 0 && (
            <Toolbar.Item flex={0} minWidth={200}>
              <Select
                value={filterByApi ?? ''}
                onValueChange={(value) => {
                  console.log('[ResearchResults] Select onValueChange called:', { value, type: typeof value });
                  // "All APIs" (empty string) should clear the filter, same as Clear Filters button
                  if (value === '' || value === null || value === undefined) {
                    console.log('[ResearchResults] Setting filterByApi to null (All APIs selected)');
                    setFilterByApi(null);
                  } else {
                    console.log('[ResearchResults] Setting filterByApi to:', value);
                    setFilterByApi(value);
                  }
                }}
                onChange={(e) => {
                  const value = e.target.value;
                  console.log('[ResearchResults] Select onChange called:', { value, type: typeof value, event: e });
                  // "All APIs" (empty string) should clear the filter, same as Clear Filters button
                  if (value === '' || value === null || value === undefined) {
                    console.log('[ResearchResults] Setting filterByApi to null (All APIs selected)');
                    setFilterByApi(null);
                  } else {
                    console.log('[ResearchResults] Setting filterByApi to:', value);
                    setFilterByApi(value);
                  }
                }}
              >
                <option value="">All APIs</option>
                {apis.map((api) => (
                  <option key={api} value={api}>
                    {getApiLabel(api)}
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
          {(filterByApi || searchQuery) && (
            <Toolbar.Item flex={0}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterByApi(null);
                  setSearchQuery('');
                }}
              >
                <Text margin={0}>Clear Filters</Text>
              </Button>
            </Toolbar.Item>
          )}
        </Toolbar>
      )}

      {/* Results List */}
      {isExpanded && (
        <YStack
          marginTop="$5"
          maxHeight={600}
          overflow="scroll"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$3"
          backgroundColor="$gray1"
        >
          {filteredResults.length === 0 ? (
            <EmptyStateCard
              title="No results match"
              description="Adjust or clear your filters to see research output."
              padding="$6"
              titleLevel={5}
            />
          ) : (
            <YStack padding="$2">
              {filteredResults.map((result) => {
                const isExpandedResult = expandedResults.has(result.id);
                return (
                  <Card
                    key={result.id}
                    variant="outlined"
                    padding={0}
                    marginBottom="$3"
                    backgroundColor="$background"
                    overflow="hidden"
                  >
                    {/* Result Header */}
                    <XStack
                      width="100%"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      padding="$4"
                      marginBottom={isExpandedResult ? '$3' : 0}
                      onPress={() => toggleResult(result.id)}
                      cursor="pointer"
                    >
                      <YStack flex={1} gap="$2" minWidth={0} flexShrink={1}>
                        <XStack alignItems="center" gap="$2" marginBottom="$2">
                          <YStack
                            width={8}
                            height={8}
                            borderRadius="$10"
                            backgroundColor={getApiColorHex(result.api)}
                            flexShrink={0}
                          />
                          <Label size="xs" tone="muted" uppercase margin={0}>
                            {getApiLabel(result.api)}
                          </Label>
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
                          {result.query}
                        </ClampText>
                      </YStack>
                      <XStack alignItems="center" marginLeft="$4" flexShrink={0}>
                        <Text fontSize="$5" color="$gray11" margin={0}>
                          {isExpandedResult ? '▼' : '▶'}
                        </Text>
                      </XStack>
                    </XStack>

                    {/* Expanded Details */}
                    {isExpandedResult && (
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
                          {result.content}
                        </Body>
                        <XStack
                          gap="$4"
                          paddingTop="$3"
                          borderTopWidth={1}
                          borderTopColor="$borderColor"
                          flexWrap="wrap"
                        >
                          {result.quality_score !== null && (
                            <XStack alignItems="center" gap="$1">
                              <Text fontSize="$2" color="$gray11" fontWeight="600" margin={0}>
                                Quality:
                              </Text>
                              <Text fontSize="$2" color="$gray11" margin={0}>
                                {(result.quality_score * 100).toFixed(0)}%
                              </Text>
                            </XStack>
                          )}
                          {result.source_url && (
                            <Text fontSize="$2" color="$gray11" margin={0}>
                              <Anchor
                                href={result.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                color="$blue11"
                              >
                                View Source →
                              </Anchor>
                            </Text>
                          )}
                          <XStack alignItems="center" gap="$1">
                            <Text fontSize="$2" color="$gray11" fontWeight="600" margin={0}>
                              Created:
                            </Text>
                            <Text fontSize="$2" color="$gray11" margin={0}>
                              {new Date(result.created_at).toLocaleString()}
                            </Text>
                          </XStack>
                        </XStack>
                        {result.metadata && Object.keys(result.metadata).length > 0 && (
                          <YStack marginTop="$3" gap="$2">
                            <Button
                              variant="ghost"
                              size="sm"
                              alignSelf="flex-start"
                              onClick={() => toggleMetadata(result.id)}
                            >
                              <Text margin={0}>
                                {expandedMetadata.has(result.id) ? 'Hide Metadata' : 'Show Metadata'}
                              </Text>
                            </Button>
                            {expandedMetadata.has(result.id) && (
                              <YStack
                                padding="$2"
                                backgroundColor="$gray1"
                                borderRadius="$2"
                              >
                                <Caption mono whitespace="preWrap">
                                  {JSON.stringify(result.metadata, null, 2)}
                                </Caption>
                              </YStack>
                            )}
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
    </YStack>
  );
}
