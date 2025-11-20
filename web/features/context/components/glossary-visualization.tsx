'use client';

import { useState } from 'react';
import { useGlossaryQuery } from '@/shared/hooks/use-glossary-query';
import {
  YStack,
  XStack,
  Text,
  Button,
  Input,
  Card,
  Alert,
  Select,
  Badge,
  TagGroup,
  BulletList,
  EmptyStateCard,
  LoadingState,
  Anchor,
  Label,
} from '@jarvis/ui-core';
import { styled } from 'tamagui';

const ExternalLink = styled(Anchor, {
  textDecorationLine: 'none',
});

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
      <LoadingState
        title="Loading glossary"
        description="Fetching glossary terms for this event."
        padding="$6"
        align="start"
        skeletons={[{ height: 24 }, { height: 24 }, { height: 24 }]}
      />
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
      <EmptyStateCard
        title="No glossary terms yet"
        description="Terms will appear here once the glossary phase completes."
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
          onClick={handleRefresh}
          disabled={isFetching}
        >
          ↻ {isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
        {categories.length > 0 && (
          <Select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            size="sm"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
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
              padding={0}
              marginBottom="$3"
            >
              {/* Term Header */}
              <Button
                variant="ghost"
                width="100%"
                padding="$4"
                backgroundColor={isExpanded ? '$gray1' : '$background'}
                justifyContent="space-between"
                onClick={() => toggleTerm(term.id)}
              >
                <YStack flex={1} gap="$2">
                  <XStack alignItems="center" gap="$2" marginBottom="$1">
                    <Body size="lg" weight="bold" margin={0}>
                      {term.term}
                    </Body>
                    {term.acronym_for && (
                      <Body size="sm" tone="muted" fontStyle="italic" margin={0}>
                        ({term.acronym_for})
                      </Body>
                    )}
                    {term.category && (
                      <Badge variant="blue" size="sm">
                        {term.category}
                      </Badge>
                    )}
                  </XStack>
                  <Body tone="muted" margin={0}>
                    {term.definition}
                  </Body>
                </YStack>
                <Body size="lg" tone="muted" marginLeft="$4" margin={0}>
                  {isExpanded ? '▼' : '▶'}
                </Body>
              </Button>

              {/* Expanded Details */}
              {isExpanded && (
                <YStack
                  padding="$4"
                  backgroundColor="$gray1"
                  borderTopWidth={1}
                  borderTopColor="$borderColor"
                  gap="$3"
                >
                  {/* Usage Examples */}
                  {term.usage_examples && term.usage_examples.length > 0 && (
                    <YStack marginBottom="$4" gap="$2">
                      <Label size="xs" tone="muted" uppercase margin={0}>
                        Usage Examples
                      </Label>
                      <BulletList
                        items={term.usage_examples}
                        renderItem={(example) => (
                          <Body tone="muted" fontStyle="italic" margin={0}>
                            "{example}"
                          </Body>
                        )}
                      />
                    </YStack>
                  )}

                  {/* Related Terms */}
                  {term.related_terms && term.related_terms.length > 0 && (
                    <YStack marginBottom="$4" gap="$2">
                      <Label size="xs" tone="muted" uppercase margin={0}>
                        Related Terms
                      </Label>
                      <TagGroup>
                        {term.related_terms.map((related, i) => (
                          <Badge key={i} variant="gray" size="sm">
                            {related}
                          </Badge>
                        ))}
                      </TagGroup>
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
                          <ExternalLink
                            href={term.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            color="$blue11"
                          >
                            View Source →
                          </ExternalLink>
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
