'use client';

import { useState } from 'react';
import { useGlossaryQuery } from '@/shared/hooks/use-glossary-query';
import { YStack, XStack, Text, Button, Input, Card, Alert } from '@jarvis/ui-core';

interface GlossaryVisualizationProps {
  eventId: string;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

export function GlossaryVisualization({ eventId, embedded = false }: GlossaryVisualizationProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());
  
  const { data: glossaryData, isLoading, error, refetch, isFetching } = useGlossaryQuery(eventId, {
    category: selectedCategory,
    search: search || undefined,
  });

  const handleRefresh = () => {
    refetch();
  };

  const toggleTerm = (termId: string) => {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  };

  // Get unique categories
  const categories = glossaryData
    ? Array.from(new Set(glossaryData.terms.map((t) => t.category || 'uncategorized')))
    : [];

  // Filter terms based on search (client-side if needed)
  const displayTerms = glossaryData?.terms || [];

  if (isLoading) {
    return (
      <Card variant="outlined" padding="$6" alignItems="center">
        <Text fontSize="$3" color="$gray11">
          Loading glossary...
        </Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <Text fontSize="$3" margin={0}>
          Error loading glossary: {error instanceof Error ? error.message : 'Unknown error'}
        </Text>
      </Alert>
    );
  }

  if (!glossaryData || glossaryData.count === 0) {
    return (
      <Card variant="outlined" padding="$6" alignItems="center">
        <Text fontSize="$3" color="$gray11" margin={0}>
          No glossary terms available yet.
        </Text>
      </Card>
    );
  }

  return (
    <YStack
      backgroundColor={embedded ? 'transparent' : '$background'}
      borderWidth={embedded ? 0 : 1}
      borderColor={embedded ? 'transparent' : '$borderColor'}
      borderRadius={embedded ? 0 : '$4'}
      padding={embedded ? 0 : '$6'}
    >
      {/* Header - only show when not embedded */}
      {!embedded && (
        <XStack
          justifyContent="space-between"
          alignItems="center"
          marginBottom="$5"
        >
          <Text fontSize="$5" fontWeight="600" color="$color" margin={0}>
            Glossary
          </Text>
          <Text fontSize="$3" color="$gray11" margin={0}>
            {glossaryData.count} {glossaryData.count === 1 ? 'term' : 'terms'}
          </Text>
        </XStack>
      )}

      {/* Search and Filter */}
      <XStack
        gap="$3"
        marginBottom="$5"
        flexWrap="wrap"
        alignItems="center"
      >
        <Input
          flex={1}
          minWidth={200}
          placeholder="Search terms..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          onPress={handleRefresh}
          disabled={isFetching}
        >
          ↻ {isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
        {categories.length > 0 && (
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
              fontFamily: 'inherit',
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
      </XStack>

      {/* Terms List */}
      <YStack gap="$3">
        {displayTerms.map((term) => {
          const isExpanded = expandedTerms.has(term.id);

          return (
            <Card
              key={term.id}
              variant="outlined"
              overflow="hidden"
            >
              {/* Term Header */}
              <Button
                variant="ghost"
                width="100%"
                padding="$3 $4"
                backgroundColor={isExpanded ? '$gray1' : '$background'}
                justifyContent="space-between"
                onPress={() => toggleTerm(term.id)}
              >
                <YStack flex={1} gap="$1">
                  <XStack alignItems="center" gap="$2" marginBottom="$1">
                    <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                      {term.term}
                    </Text>
                    {term.acronym_for && (
                      <Text fontSize="$2" color="$gray11" fontStyle="italic" margin={0}>
                        ({term.acronym_for})
                      </Text>
                    )}
                    {term.category && (
                      <YStack
                        padding="$0.5 $2"
                        backgroundColor="$blue2"
                        borderRadius="$1"
                      >
                        <Text fontSize="$1" fontWeight="500" color="$blue11" margin={0}>
                          {term.category}
                        </Text>
                      </YStack>
                    )}
                  </XStack>
                  <Text fontSize="$3" color="$gray11" lineHeight={1.4} margin={0}>
                    {term.definition}
                  </Text>
                </YStack>
                <Text
                  fontSize="$5"
                  color="$gray11"
                  marginLeft="$4"
                  style={{
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                  margin={0}
                >
                  ▶
                </Text>
              </Button>

              {/* Expanded Details */}
              {isExpanded && (
                <YStack
                  padding="$4"
                  backgroundColor="$gray1"
                  borderTopWidth={1}
                  borderTopColor="$borderColor"
                >
                  {/* Usage Examples */}
                  {term.usage_examples && term.usage_examples.length > 0 && (
                    <YStack marginBottom="$4">
                      <Text
                        fontSize="$1"
                        fontWeight="600"
                        color="$gray11"
                        textTransform="uppercase"
                        marginBottom="$2"
                        margin={0}
                      >
                        Usage Examples
                      </Text>
                      <YStack as="ul" margin={0} paddingLeft="$5" color="$gray9" fontSize="$3" gap="$1">
                        {term.usage_examples.map((example, i) => (
                          <Text as="li" key={i} fontStyle="italic" margin={0}>
                            "{example}"
                          </Text>
                        ))}
                      </YStack>
                    </YStack>
                  )}

                  {/* Related Terms */}
                  {term.related_terms && term.related_terms.length > 0 && (
                    <YStack marginBottom="$4">
                      <Text
                        fontSize="$1"
                        fontWeight="600"
                        color="$gray11"
                        textTransform="uppercase"
                        marginBottom="$2"
                        margin={0}
                      >
                        Related Terms
                      </Text>
                      <XStack flexWrap="wrap" gap="$1.5">
                        {term.related_terms.map((related, i) => (
                          <YStack
                            key={i}
                            padding="$1 $2"
                            backgroundColor="$gray3"
                            borderRadius="$1"
                          >
                            <Text fontSize="$2" color="$gray9" margin={0}>
                              {related}
                            </Text>
                          </YStack>
                        ))}
                      </XStack>
                    </YStack>
                  )}

                  {/* Metadata */}
                  <XStack
                    gap="$4"
                    fontSize="$2"
                    color="$gray11"
                    paddingTop="$3"
                    borderTopWidth={1}
                    borderTopColor="$borderColor"
                    flexWrap="wrap"
                  >
                    {term.confidence_score !== null && (
                      <Text margin={0}>
                        <Text fontWeight="600" margin={0}>Confidence:</Text> {(term.confidence_score * 100).toFixed(0)}%
                      </Text>
                    )}
                    {term.agent_utility && term.agent_utility.length > 0 && (
                      <Text margin={0}>
                        <Text fontWeight="600" margin={0}>Agent Utility:</Text>{' '}
                        {term.agent_utility
                          .map((agent) => agent.charAt(0).toUpperCase() + agent.slice(1))
                          .join(', ')}
                      </Text>
                    )}
                    {term.source && (
                      <Text margin={0}>
                        <Text fontWeight="600" margin={0}>Source:</Text> {term.source}
                      </Text>
                    )}
                    {term.source_url && (
                      <Text margin={0}>
                        <Text
                          as="a"
                          href={term.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          color="$blue11"
                          textDecoration="none"
                          margin={0}
                        >
                          View Source →
                        </Text>
                      </Text>
                    )}
                  </XStack>
                </YStack>
              )}
            </Card>
          );
        })}
      </YStack>
    </YStack>
  );
}
