'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { EventWithStatus } from '@/shared/types/event';
import { getEvents } from '@/server/actions/event-actions';
import { format, parseISO } from 'date-fns';
import { YStack, XStack, Text, Card, Alert, EmptyStateCard, LoadingState, ClampText } from '@jarvis/ui-core';

interface EventsListProps {
  searchQuery?: string;
  statusFilter?: 'all' | 'scheduled' | 'live' | 'ended';
}

export function EventsList({ searchQuery = '', statusFilter = 'all' }: EventsListProps) {
  const [events, setEvents] = useState<EventWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await getEvents({
        search: searchQuery || undefined,
        status: statusFilter,
      });

      if (fetchError) {
        setError(fetchError);
        setEvents([]);
      } else {
        setEvents(data || []);
      }
      
      setLoading(false);
    }

    fetchEvents();
  }, [searchQuery, statusFilter]);

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'Not scheduled';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusColor = (status: EventWithStatus['status']) => {
    switch (status) {
      case 'live':
        return '$green11';
      case 'scheduled':
        return '$blue6';
      case 'ended':
        return '$gray11';
      default:
        return '$gray11';
    }
  };

  const getStatusBgColor = (status: EventWithStatus['status']) => {
    switch (status) {
      case 'live':
        return '$green2';
      case 'scheduled':
        return '$blue2';
      case 'ended':
        return '$gray2';
      default:
        return '$gray2';
    }
  };

  const getStatusLabel = (status: EventWithStatus['status']): string => {
    switch (status) {
      case 'live':
        return 'Live';
      case 'scheduled':
        return 'Scheduled';
      case 'ended':
        return 'Ended';
      default:
        return 'Unknown';
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Loading events"
        description="Fetching your latest events."
        padding="$10 $6"
        skeletons={[
          { height: 80, width: '100%' },
          { height: 80, width: '100%' },
        ]}
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
        padding="$10 $6"
      />
    );
  }

  return (
    <YStack gap="$3">
      {events.map((event) => (
        <Card
          key={event.id}
          asChild
          padding="$5"
          hoverStyle={{
            borderColor: '$borderColorHover',
            shadowColor: '$color',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
          <Link href={`/events/${event.id}/live`}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$4">
              <YStack flex={1} minWidth={0} gap="$2">
                <XStack alignItems="center" gap="$3" marginBottom="$2">
                  <Text fontSize="$5" fontWeight="600" color="$color" margin={0}>
                    {event.title}
                  </Text>
                  <YStack
                    paddingHorizontal="$2.5"
                    paddingVertical="$1"
                    borderRadius="$4"
                    backgroundColor={getStatusBgColor(event.status)}
                  >
                    <Text
                      fontSize="$2"
                      fontWeight="500"
                      color={getStatusColor(event.status)}
                    >
                      {getStatusLabel(event.status)}
                    </Text>
                  </YStack>
                </XStack>
                
                {event.topic && (
                  <ClampText
                    lines={2}
                    fontSize="$3"
                    color="$gray11"
                    marginBottom="$3"
                  >
                    {event.topic.replace(/[#*`]/g, '').substring(0, 150)}
                    {event.topic.length > 150 ? '...' : ''}
                  </ClampText>
                )}

                <XStack gap="$6">
                  <Text fontSize="$3" color="$gray11">
                    <Text fontWeight="600" color="$gray9">Start:</Text>{' '}
                    {formatDateTime(event.start_time)}
                  </Text>
                  {event.end_time && (
                    <Text fontSize="$3" color="$gray11">
                      <Text fontWeight="600" color="$gray9">End:</Text>{' '}
                      {formatDateTime(event.end_time)}
                    </Text>
                  )}
                </XStack>
              </YStack>
            </XStack>
          </Link>
        </Card>
      ))}
    </YStack>
  );
}
