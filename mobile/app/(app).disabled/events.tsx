import { useState } from 'react';
import { useEventsQuery } from '@/hooks/use-events-query';
import {
  YStack,
  XStack,
  Heading,
  Body,
  Button,
  Input,
  Card,
  Alert,
  EmptyStateCard,
  LoadingState,
  Text,
} from '@jarvis/ui-core';
import { EventWithStatus } from '@/types/event';

function EventCard({ event }: { event: EventWithStatus }) {
  return (
    <Card variant="outlined" padding="$4">
      <YStack gap="$2">
        <Heading level={4} margin={0}>{event.title}</Heading>
        {event.topic && (
          <Body tone="muted" size="sm" margin={0}>{event.topic}</Body>
        )}
        <XStack gap="$4" marginTop="$2">
          <Body size="xs" tone="muted" margin={0}>
            Status: {event.status}
          </Body>
          {event.start_time && (
            <Body size="xs" tone="muted" margin={0}>
              Start: {new Date(event.start_time).toLocaleDateString()}
            </Body>
          )}
        </XStack>
      </YStack>
    </Card>
  );
}

export default function EventsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'ended'>('all');
  const [page, setPage] = useState(1);

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
    limit: 20,
  });

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  return (
    <YStack padding="$6" maxWidth={1400} marginHorizontal="auto" width="100%">
      <YStack marginBottom="$6">
        <Heading level={2} marginBottom="$2">Events</Heading>
        <Body tone="muted" margin={0}>Manage and monitor your academic events</Body>
      </YStack>

      <Card variant="outlined" padding="$0" overflow="hidden">
        <YStack padding="$4" borderBottomWidth={1} borderBottomColor="$borderColor">
          <YStack gap="$4">
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              width="100%"
            />
            <XStack gap="$4" alignItems="center">
              <Body size="sm" margin={0}>Status:</Body>
              <Button
                size="sm"
                variant={statusFilter === 'all' ? 'primary' : 'outline'}
                onPress={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'live' ? 'primary' : 'outline'}
                onPress={() => setStatusFilter('live')}
              >
                Live
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'scheduled' ? 'primary' : 'outline'}
                onPress={() => setStatusFilter('scheduled')}
              >
                Scheduled
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'ended' ? 'primary' : 'outline'}
                onPress={() => setStatusFilter('ended')}
              >
                Ended
              </Button>
            </XStack>
          </YStack>
        </YStack>

        <YStack padding="$5">
          {isLoading && (
            <LoadingState
              title="Loading events"
              description="Fetching your latest events."
            />
          )}

          {error && (
            <Alert variant="error">Error loading events: {error}</Alert>
          )}

          {!isLoading && !error && events.length === 0 && (
            <EmptyStateCard
              title="No events found"
              description={
                searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Create your first event to get started.'
              }
            />
          )}

          {!isLoading && !error && events.length > 0 && (
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
          )}
        </YStack>
      </Card>
    </YStack>
  );
}

