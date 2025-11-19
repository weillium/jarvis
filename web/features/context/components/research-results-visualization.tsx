'use client';

import { useState } from 'react';
import { useResearchQuery } from '@/shared/hooks/use-research-query';
import type { ResearchResult } from '@/shared/hooks/use-research-query';
import { YStack, XStack, Text, Button, Input, Card, Alert } from '@jarvis/ui-core';

interface ResearchResultsVisualizationProps {
  eventId: string;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

export function ResearchResultsVisualization({ eventId, embedded = false }: ResearchResultsVisualizationProps) {
  const { data: researchData, isLoading, error, refetch, isFetching } = useResearchQuery(eventId);
  const [isExpanded, setIsExpanded] = useState(embedded); // Auto-expand when embedded
  const [filterByApi, setFilterByApi] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter results
  const filteredResults = researchData?.results.filter((result) => {
    if (filterByApi && result.api !== filterByApi) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesQuery = result.query.toLowerCase().includes(query) ||
                           result.content.toLowerCase().includes(query);
      if (!matchesQuery) return false;
    }
    return true;
  }) || [];

  // Get unique APIs for filter
  const apis = researchData
    ? Array.from(new Set(researchData.results.map((r) => r.api))).sort()
    : [];

  if (isLoading) {
    return (
      <YStack
        backgroundColor={embedded ? 'transparent' : '$background'}
        borderWidth={embedded ? 0 : 1}
        borderColor={embedded ? 'transparent' : '$borderColor'}
        borderRadius={embedded ? 0 : '$4'}
        padding={embedded ? 0 : '$6'}
        marginBottom={embedded ? 0 : '$6'}
      >
        <YStack padding="$6" alignItems="center">
          <Text fontSize="$3" color="$gray11">
            Loading research results...
          </Text>
        </YStack>
      </YStack>
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
      <YStack
        backgroundColor={embedded ? 'transparent' : '$background'}
        borderWidth={embedded ? 0 : 1}
        borderColor={embedded ? 'transparent' : '$borderColor'}
        borderRadius={embedded ? 0 : '$4'}
        padding={embedded ? 0 : '$6'}
        marginBottom={embedded ? 0 : '$6'}
      >
        <YStack padding="$6" alignItems="center">
          <Text fontSize="$3" color="$gray11" marginBottom="$2" margin={0}>
            No research results available yet.
          </Text>
          <Text fontSize="$2" color="$gray11" opacity={0.8} margin={0}>
            Research results will appear here after the research phase completes.
          </Text>
        </YStack>
      </YStack>
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
                {researchData.count} {researchData.count === 1 ? 'result' : 'results'}
              </Text>
              {researchData.avgQualityScore > 0 && (
                <Text fontSize="$2" color="$gray11" margin={0}>
                  Avg Quality: {(researchData.avgQualityScore * 100).toFixed(0)}%
                </Text>
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
              <Text
                fontSize="$1"
                fontWeight="600"
                color="$gray11"
                textTransform="uppercase"
                letterSpacing={0.5}
                marginBottom="$1"
                margin={0}
              >
                {getApiLabel(api)}
              </Text>
              <Text fontSize="$5" fontWeight="700" color="$color" margin={0}>
                {count}
              </Text>
            </YStack>
          ))}
        </XStack>
      )}

      {/* Search and Filters */}
      {isExpanded && researchData.count > 0 && (
        <XStack
          gap="$3"
          marginBottom="$3"
          flexWrap="wrap"
          alignItems="center"
        >
          <Input
            flex={1}
            minWidth={200}
            placeholder="Search results..."
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
          {apis.length > 0 && (
            <select
              value={filterByApi || ''}
              onChange={(e) => setFilterByApi(e.target.value || null)}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                background: '#ffffff',
                fontFamily: 'inherit',
              }}
            >
              <option value="">All APIs</option>
              {apis.map((api) => (
                <option key={api} value={api}>
                  {getApiLabel(api)}
                </option>
              ))}
            </select>
          )}
          {(filterByApi || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setFilterByApi(null);
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </XStack>
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
            <YStack padding="$6" alignItems="center">
              <Text fontSize="$3" color="$gray11">
                No research results match the selected filter.
              </Text>
            </YStack>
          ) : (
            <YStack padding="$2">
              {filteredResults.map((result) => {
                const isExpandedResult = expandedResults.has(result.id);
                return (
                  <Card
                    key={result.id}
                    variant="outlined"
                    padding="$4"
                    marginBottom="$2"
                    backgroundColor="$background"
                  >
                    {/* Result Header */}
                    <Button
                      variant="ghost"
                      width="100%"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      padding={0}
                      marginBottom={isExpandedResult ? '$3' : 0}
                      onPress={() => toggleResult(result.id)}
                    >
                      <YStack flex={1} gap="$2">
                        <XStack alignItems="center" gap="$2" marginBottom="$2">
                          <YStack
                            width={8}
                            height={8}
                            borderRadius="$10"
                            backgroundColor={getApiColorHex(result.api)}
                          />
                          <Text
                            fontSize="$2"
                            fontWeight="600"
                            color="$gray11"
                            textTransform="uppercase"
                            margin={0}
                          >
                            {getApiLabel(result.api)}
                          </Text>
                        </XStack>
                        <Text fontSize="$3" fontWeight="600" color="$color" marginBottom="$1" margin={0}>
                          Query: {result.query}
                        </Text>
                        {!isExpandedResult && (
                          <Text
                            fontSize="$2"
                            color="$gray11"
                            lineHeight={1.5}
                            numberOfLines={2}
                            margin={0}
                          >
                            {result.content}
                          </Text>
                        )}
                      </YStack>
                      <Text
                        fontSize="$5"
                        color="$gray11"
                        marginLeft="$4"
                        style={{
                          transform: isExpandedResult ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                        margin={0}
                      >
                        ▶
                      </Text>
                    </Button>

                    {/* Expanded Details */}
                    {isExpandedResult && (
                      <YStack
                        paddingTop="$3"
                        borderTopWidth={1}
                        borderTopColor="$borderColor"
                      >
                        <Text
                          fontSize="$2"
                          color="$gray9"
                          lineHeight={1.6}
                          marginBottom="$3"
                          whiteSpace="pre-wrap"
                          margin={0}
                        >
                          {result.content}
                        </Text>
                        <XStack
                          gap="$4"
                          paddingTop="$3"
                          borderTopWidth={1}
                          borderTopColor="$borderColor"
                          flexWrap="wrap"
                        >
                          {result.quality_score !== null && (
                            <Text fontSize="$2" color="$gray11" margin={0}>
                              <Text fontWeight="600" margin={0}>Quality:</Text> {(result.quality_score * 100).toFixed(0)}%
                            </Text>
                          )}
                          {result.source_url && (
                            <Text fontSize="$2" color="$gray11" margin={0}>
                              <a
                                href={result.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#3b82f6', textDecoration: 'none' }}
                              >
                                View Source →
                              </a>
                            </Text>
                          )}
                          <Text fontSize="$2" color="$gray11" margin={0}>
                            <Text fontWeight="600" margin={0}>Created:</Text> {new Date(result.created_at).toLocaleString()}
                          </Text>
                        </XStack>
                        {result.metadata && Object.keys(result.metadata).length > 0 && (
                          <details style={{ marginTop: '12px', fontSize: '11px', color: '#64748b' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: '500' }}>
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
                                margin={0}
                              >
                                {JSON.stringify(result.metadata, null, 2)}
                              </Text>
                            </YStack>
                          </details>
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

