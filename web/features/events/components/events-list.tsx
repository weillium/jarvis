'use client';

import { useState, useMemo } from 'react';
import { useEventsQuery } from '@/shared/hooks/use-events-query';
import { EventCard } from './event-card';
import { EventWithStatus } from '@/shared/types/event';
import { YStack, XStack, Alert, EmptyStateCard, LoadingState, Button, Text } from '@jarvis/ui-core';

interface EventsListProps {
  searchQuery?: string;
  statusFilter?: 'all' | 'scheduled' | 'live' | 'ended';
  initialData?: {
    data: EventWithStatus[] | null;
    error: string | null;
    total?: number;
    page?: number;
    limit?: number;
  };
}

const EVENTS_PER_PAGE = 20;

export function EventsList({ searchQuery = '', statusFilter = 'all', initialData }: EventsListProps) {
  const [page, setPage] = useState(1);

  // Reset to page 1 when filters change
  useMemo(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const {
    events,
    total,
    page: currentPage,
    limit,
    isLoading,
    error,
  } = useEventsQuery({
    search: searchQuery || undefined,
    status: statusFilter,
    page,
    limit: EVENTS_PER_PAGE,
    // Pass initialData only for the first render with default filters
    initialData: page === 1 && !searchQuery && statusFilter === 'all' ? initialData : undefined,
  });

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  if (isLoading) {
    return (
      <LoadingState
        title="Loading events"
        description="Fetching your latest events."
      />
    );
  }

  if (error) {
    return (
      <YStack alignItems="center" paddingVertical="$12" paddingHorizontal="$6">
        <Alert variant="error">Error loading events: {error}</Alert>
      </YStack>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyStateCard
        title="No events found"
        description={
          searchQuery || statusFilter !== 'all'
            ? 'Try adjusting your search or filter criteria.'
            : 'Create your first event to get started.'
        }
      />
    );
  }

  return (
    <YStack gap="$4">
      <YStack gap="$3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </YStack>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingVertical="$4"
          paddingHorizontal="$2"
          gap="$4"
        >
          <Text fontSize="$3" color="$gray11">
            Page {currentPage} of {totalPages} ({total} total)
          </Text>
          
          <XStack gap="$2">
            <Button
              size="sm"
              variant="outline"
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!hasPrevPage}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={!hasNextPage}
            >
              Next
            </Button>
          </XStack>
        </XStack>
      )}
    </YStack>
  );
}
